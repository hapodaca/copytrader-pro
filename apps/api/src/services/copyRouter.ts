import { Signal } from '@prisma/client'
import { prisma } from '../db/client'
import { canTrade } from './scheduleFilter'
import { calculateQty } from './riskEngine'
import { enqueueOrder } from './orderQueue'
import { notifySignalResult, AccountResult } from './notifications'
import { emitToUser } from './sse'
import { BrokerRegistry } from '../integrations/broker/BrokerRegistry'

type FollowerOutcome =
  | { kind: 'enqueued'; accountName: string }
  | { kind: 'manual';   accountName: string }
  | { kind: 'skipped';  accountName: string; reason: string }

export async function routeSignal(signal: Signal, groupId?: string): Promise<void> {
  // Acumuladores para la notificación única por señal
  const enqueuedAccounts: AccountResult[] = []
  const manualAccounts:   AccountResult[] = []
  const skippedAccounts:  AccountResult[] = []

  // Caché de margen inicial por broker+símbolo — una señal a N cuentas hace
  // una sola consulta al broker en lugar de N
  const marginCache = new Map<string, Promise<number>>()
  const getMargin = (brokerType: string, symbol: string): Promise<number> => {
    const key = `${brokerType}:${symbol}`
    let cached = marginCache.get(key)
    if (!cached) {
      cached = BrokerRegistry.get(brokerType).getInitialMargin(symbol)
      marginCache.set(key, cached)
    }
    return cached
  }

  // Buscar grupos activos del usuario que envió la señal
  // userId siempre presente como defensa en profundidad — aunque el caller
  // valide la pertenencia del grupo, nunca distribuir a grupos de otro usuario
  const groups = await prisma.copyGroup.findMany({
    where: {
      isActive: true,
      userId: signal.userId,
      ...(groupId ? { id: groupId } : {}),
    },
    include: {
      followers: {
        where: { isActive: true },
        include: { follower: { include: { tradingRules: true } } },
        orderBy: { rotateOrder: 'asc' },
      },
    },
  })

  for (const group of groups) {
    // Tipo de Grupo: los grupos "master" solo registran señales — no distribuyen
    // copy_group → SÍ distribuye a las cuentas vinculadas
    if ((group.tipoGrupo as string) === 'master') continue

    // Filtro por símbolo/ticker del grupo (si está configurado)
    if (group.symbol && group.symbol.toUpperCase() !== signal.symbol.toUpperCase()) continue

    if (group.followers.length === 0) continue

    let selectedFollowers = group.followers

    // ── Modo de distribución ────────────────────────────────────────────────
    if (group.distributionMode === 'rotate') {
      // 1 sola cuenta por señal, turno rotativo simple
      const idx = group.rotateIndex % group.followers.length
      selectedFollowers = [group.followers[idx]]
      await prisma.copyGroup.update({
        where: { id: group.id },
        data: { rotateIndex: (idx + 1) % group.followers.length },
      })

    } else if (group.distributionMode === 'rotate_group') {
      // Grupos fijos de N cuentas que rotan por bloque
      // Señal1 → [A,B,C]  Señal2 → [D,E,F]  Señal3 → [G,H,I]  Señal4 → [A,B,C]...
      const batchSize = Math.max(1, group.batchSize ?? 4)
      const numBatches = Math.ceil(group.followers.length / batchSize)
      const batchIdx = group.rotateIndex % numBatches
      selectedFollowers = group.followers.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize)
      await prisma.copyGroup.update({
        where: { id: group.id },
        data: { rotateIndex: (batchIdx + 1) % numBatches },
      })

    } else if (group.distributionMode === 'batch_rotate') {
      // N cuentas por señal — prioridad a las que llevan más tiempo sin operar
      // Si batch_size >= cuentas disponibles, opera todas (equivale a 'all')
      const batchSize = Math.max(1, group.batchSize ?? 4)
      const sorted = [...group.followers].sort((a, b) => {
        const aTime = a.lastOrderAt?.getTime() ?? 0
        const bTime = b.lastOrderAt?.getTime() ?? 0
        return aTime - bTime   // ASC: primero las que llevan más tiempo sin operar
      })
      selectedFollowers = sorted.slice(0, batchSize)
    }
    // else: distributionMode === 'all' → selectedFollowers = todos (sin cambio)

    // ── Enviar a cada seguidor seleccionado (en paralelo) ───────────────────
    // Cada cuenta es independiente; procesarlas en serie hacía que la última
    // recibiera su orden segundos después que la primera (slippage).
    const processFollower = async (
      follower: (typeof selectedFollowers)[number],
    ): Promise<FollowerOutcome> => {
      const account = follower.follower
      const rules = account.tradingRules

      // ── Cierres: un CLOSE nunca se bloquea por horario/riesgo/duplicados ──
      // Cierra la posición abierta con su misma cantidad; se envía automático
      // incluso en grupos manuales (dejar una posición abierta es más riesgoso
      // que ejecutar el cierre sin confirmación).
      const isClose = signal.action === 'CLOSE_LONG' || signal.action === 'CLOSE_SHORT'
      if (isClose) {
        const openSide = signal.action === 'CLOSE_LONG' ? 'BUY' : 'SELL'
        const openOrder = await prisma.order.findFirst({
          where: { accountId: account.id, symbol: signal.symbol, side: openSide, status: 'filled', closedAt: null },
          orderBy: { createdAt: 'desc' },
        })
        if (!openOrder) {
          await createSkippedOrder(signal, account.id, 'SIN_POSICION', group.id)
          return { kind: 'skipped', accountName: account.name, reason: 'SIN_POSICION' }
        }

        const order = await prisma.order.create({
          data: {
            signalId: signal.id,
            accountId: account.id,
            groupId: group.id,
            symbol: signal.symbol,
            side: signal.action,
            qty: openOrder.qty,
            status: 'pending',
            source: signal.source,
            timeframe: signal.timeframe ?? null,
          },
        })
        await enqueueOrder({
          orderId: order.id,
          accountId: account.id,
          signalId: signal.id,
          symbol: signal.symbol,
          action: signal.action,
          qty: openOrder.qty,
          price: signal.price ?? null,
        })
        return { kind: 'enqueued', accountName: account.name }
      }

      if (!rules) {
        await createSkippedOrder(signal, account.id, 'SIN_REGLAS', group.id)
        return { kind: 'skipped', accountName: account.name, reason: 'SIN_REGLAS' }
      }

      const { allowed, reason } = await canTrade(account.id, rules)
      if (!allowed) {
        const skipReason = reason ?? 'FILTRO_HORARIO'
        await createSkippedOrder(signal, account.id, skipReason, group.id)
        return { kind: 'skipped', accountName: account.name, reason: skipReason }
      }

      const margin = await getMargin(account.brokerType, signal.symbol)
      const qty = await calculateQty(account, signal.symbol, follower.riskPct, rules, margin)
      if (qty === 0) {
        await createSkippedOrder(signal, account.id, 'SALDO_INSUFICIENTE', group.id)
        return { kind: 'skipped', accountName: account.name, reason: 'SALDO_INSUFICIENTE' }
      }

      // orderMode ahora es a nivel de Grupo, no de cuenta
      const isManual = group.orderMode === 'manual'

      // ── Checkpoint: evitar órdenes duplicadas ───────────────────────────
      // Si ya existe una orden activa (en cola, enviada o posición abierta)
      // para esta cuenta + símbolo, saltar esta señal
      const existingActive = await prisma.order.findFirst({
        where: {
          accountId: account.id,
          symbol: signal.symbol,
          OR: [
            { status: { in: ['pending', 'sent', 'awaiting_manual'] } },
            { status: 'filled', closedAt: null },
          ],
        },
      })
      if (existingActive) {
        await createSkippedOrder(signal, account.id, 'ORDEN_DUPLICADA', group.id)
        return { kind: 'skipped', accountName: account.name, reason: 'ORDEN_DUPLICADA' }
      }

      const order = await prisma.order.create({
        data: {
          signalId: signal.id,
          accountId: account.id,
          groupId: group.id,
          symbol: signal.symbol,
          side: signal.action,
          qty,
          sl: signal.sl ?? null,
          tp: signal.tp ?? null,
          status: isManual ? 'awaiting_manual' : 'pending',
          source: signal.source,
          timeframe: signal.timeframe ?? null,
        },
      })

      // Manual mode: order waits for user to click Enviar
      if (!isManual) {
        await enqueueOrder({
          orderId: order.id,
          accountId: account.id,
          signalId: signal.id,
          symbol: signal.symbol,
          action: signal.action,
          qty,
          sl: signal.sl ?? null,
          tp: signal.tp ?? null,
          price: signal.price ?? null,
        })
        return { kind: 'enqueued', accountName: account.name }
      }

      // Emitir evento SSE para notificar al usuario en tiempo real
      emitToUser(signal.userId, 'manual_order', {
        id:         order.id,
        signalId:   signal.id,
        accountId:  account.id,
        symbol:     signal.symbol,
        side:       signal.action,
        qty,
        sl:         signal.sl ?? null,
        tp:         signal.tp ?? null,
        createdAt:  order.createdAt.toISOString(),
        source:     signal.source ?? null,
        timeframe:  signal.timeframe ?? null,
        account:    { id: account.id, name: account.name },
        group:      { id: group.id, name: group.name },
        signal:     { id: signal.id, screenshotUrl: signal.screenshotUrl ?? null },
      })
      return { kind: 'manual', accountName: account.name }
    }

    const outcomes = await Promise.all(
      selectedFollowers.map((follower) =>
        processFollower(follower).catch((err): FollowerOutcome => {
          console.error(`[ROUTER] Error procesando cuenta ${follower.follower.name}:`, err.message)
          return { kind: 'skipped', accountName: follower.follower.name, reason: 'ERROR_INTERNO' }
        }),
      ),
    )

    for (const o of outcomes) {
      if (o.kind === 'enqueued')     enqueuedAccounts.push({ accountName: o.accountName })
      else if (o.kind === 'manual')  manualAccounts.push({ accountName: o.accountName })
      else                           skippedAccounts.push({ accountName: o.accountName, reason: o.reason })
    }

    // Actualizar lastOrderAt para batch_rotate (usado como criterio de ordenación)
    if (group.distributionMode === 'batch_rotate') {
      await prisma.groupFollower.updateMany({
        where: { id: { in: selectedFollowers.map(f => f.id) } },
        data: { lastOrderAt: new Date() },
      })
    }
  }

  await prisma.signal.update({ where: { id: signal.id }, data: { status: 'processed' } })

  // Log resumen de distribución
  const totalProcessed = enqueuedAccounts.length + manualAccounts.length + skippedAccounts.length
  if (totalProcessed > 0) {
    const parts: string[] = []
    if (enqueuedAccounts.length) parts.push(`✅ enviadas:${enqueuedAccounts.length}`)
    if (manualAccounts.length)   parts.push(`🕐 manual:${manualAccounts.length}`)
    if (skippedAccounts.length)  parts.push(`⏭ saltadas:${skippedAccounts.length} (${[...new Set(skippedAccounts.map(s => s.reason))].join(',')})`)
    console.log(`[ROUTER] ${signal.symbol} ${signal.action} → ${parts.join(' | ')}`)
  } else {
    console.log(`[ROUTER] ${signal.symbol} ${signal.action} → sin grupos activos o sin seguidores`)
  }

  // ── UN SOLO email/telegram por señal, con todos los resultados ──────────────
  if (enqueuedAccounts.length + manualAccounts.length + skippedAccounts.length > 0) {
    notifySignalResult(signal.userId, signal.symbol, signal.action, {
      enqueuedAccounts,
      manualAccounts,
      skippedAccounts,
      errorAccounts: [],
    }).catch(() => {})
  }
}

async function createSkippedOrder(signal: Signal, accountId: string, skipReason: string, groupId?: string) {
  await prisma.order.create({
    data: {
      signalId: signal.id,
      accountId,
      groupId: groupId ?? null,
      symbol: signal.symbol,
      side: signal.action,
      qty: 0,
      status: 'skipped',
      skipReason,
      source: signal.source,
      timeframe: signal.timeframe ?? null,
    },
  })
}

