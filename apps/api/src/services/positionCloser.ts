import { Order } from '@prisma/client'
import { prisma } from '../db/client'

// Valor en USD de 1 punto por contrato (aproximado, para PnL simulado en paper).
// Para brokers reales el PnL vendrá del fill real del broker.
const POINT_VALUE: Record<string, number> = {
  MNQ: 2,    NQ: 20,    // Nasdaq micro / e-mini
  MES: 5,    ES: 50,    // S&P 500
  MYM: 0.5,  YM: 5,     // Dow
  M2K: 5,    RTY: 50,   // Russell 2000
  MGC: 10,   GC: 100,   // Oro
  MCL: 100,  CL: 1000,  // Crudo
  MBT: 0.1,  BTC: 5,    // Bitcoin
}

function pointValueFor(symbol: string): number {
  const root = symbol.replace(/[FGHJKMNQUVXZ]\d{1,2}(!)?$/, '').replace(/[!1]+$/, '')
  return POINT_VALUE[root] ?? POINT_VALUE[symbol] ?? 1
}

function chicagoDayUTC(date = new Date()): Date {
  const chicagoStr = date.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const dayIso = new Date(chicagoStr).toISOString().split('T')[0]
  return new Date(`${dayIso}T00:00:00.000Z`)
}

export interface CloseResult {
  openOrder: Order
  pnl: number | null
  winLoss: 'W' | 'L' | null
}

/**
 * Cierra la posición abierta de una cuenta+símbolo: marca exitPrice/closedAt/winLoss
 * en la orden de entrada, acumula el PnL en DailyStat y ajusta el balance (paper).
 * Devuelve null si no había posición abierta.
 */
export async function closePosition(
  accountId: string,
  symbol: string,
  closeAction: 'CLOSE_LONG' | 'CLOSE_SHORT',
  exitPrice: number | null,
): Promise<CloseResult | null> {
  const openSide = closeAction === 'CLOSE_LONG' ? 'BUY' : 'SELL'

  const openOrder = await prisma.order.findFirst({
    where: { accountId, symbol, side: openSide, status: 'filled', closedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!openOrder) return null

  // PnL solo si conocemos ambos precios
  let pnl: number | null = null
  let winLoss: 'W' | 'L' | null = null
  if (exitPrice != null && exitPrice > 0 && openOrder.fillPrice != null && openOrder.fillPrice > 0) {
    const direction = openSide === 'BUY' ? 1 : -1
    const points = (exitPrice - openOrder.fillPrice) * direction
    pnl = Number((points * pointValueFor(symbol) * openOrder.qty).toFixed(2))
    winLoss = pnl > 0 ? 'W' : pnl < 0 ? 'L' : null
  }

  await prisma.order.update({
    where: { id: openOrder.id },
    data: {
      exitPrice: exitPrice ?? undefined,
      closedAt: new Date(),
      winLoss,
    },
  })

  // ── DailyStat: PnL acumulado + win/loss + racha de pérdidas ────────────────
  const date = chicagoDayUTC()
  const existing = await prisma.dailyStat.findUnique({
    where: { accountId_date: { accountId, date } },
  })
  await prisma.dailyStat.upsert({
    where: { accountId_date: { accountId, date } },
    update: {
      ...(pnl != null ? { pnl: { increment: pnl } } : {}),
      ...(winLoss === 'W' ? { winCount: { increment: 1 }, consecutiveLosses: 0 } : {}),
      ...(winLoss === 'L' ? { lossCount: { increment: 1 }, consecutiveLosses: (existing?.consecutiveLosses ?? 0) + 1 } : {}),
    },
    create: {
      accountId,
      date,
      pnl: pnl ?? 0,
      winCount: winLoss === 'W' ? 1 : 0,
      lossCount: winLoss === 'L' ? 1 : 0,
      consecutiveLosses: winLoss === 'L' ? 1 : 0,
    },
  })

  // Paper: reflejar el PnL en el balance simulado
  if (pnl != null) {
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (account?.brokerType === 'paper') {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: { increment: pnl } },
      })
    }
  }

  const pnlStr = pnl != null ? ` PnL=$${pnl}` : ''
  console.log(`[CLOSE] ${symbol} ${closeAction} qty=${openOrder.qty}${pnlStr}${winLoss ? ` (${winLoss})` : ''} (acct:${accountId.slice(-6)})`)

  return { openOrder, pnl, winLoss }
}
