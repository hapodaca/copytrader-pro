import { Prisma } from '@prisma/client'
import { Router, Response } from 'express'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { enqueueOrder } from '../services/orderQueue'
import { stripAccountTokens } from '../utils/sanitizeAccount'

const router = Router()

type OrderSortField =
  | 'createdAt'
  | 'symbol'
  | 'side'
  | 'status'
  | 'source'
  | 'fillPrice'
  | 'exitPrice'
  | 'winLoss'
  | 'account'

const ORDER_SORT_FIELDS: OrderSortField[] = [
  'createdAt',
  'symbol',
  'side',
  'status',
  'source',
  'fillPrice',
  'exitPrice',
  'winLoss',
  'account',
]

function parseDateBoundary(input: string | undefined, endOfDay: boolean): Date | undefined {
  if (!input) return undefined

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? new Date(`${input}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(input)

  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

// GET /api/orders  — soporta ?status=awaiting_manual para polling del panel manual
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const query = req.query as Record<string, string>

    const accountId = query.accountId
    const groupId = query.groupId
    const date = query.date
    const source = query.source
    const status = query.status

    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
    const offset = Math.max(0, Number(query.offset) || 0)

    const sortByRaw = query.sortBy
    const sortDirRaw = query.sortDir

    const sortBy: OrderSortField = ORDER_SORT_FIELDS.includes(sortByRaw as OrderSortField)
      ? (sortByRaw as OrderSortField)
      : 'createdAt'

    const sortDir: Prisma.SortOrder = sortDirRaw === 'asc' ? 'asc' : 'desc'

    const orderBy: Prisma.OrderOrderByWithRelationInput =
      sortBy === 'account'
        ? { account: { name: sortDir } }
        : ({ [sortBy]: sortDir } as Prisma.OrderOrderByWithRelationInput)

    const userAccounts = await prisma.account.findMany({
      where: { userId: req.user!.id },
      select: { id: true },
    })
    const userAccountIds = userAccounts.map((a) => a.id)

    // Solo permitir filtrar por cuentas propias
    if (accountId && !userAccountIds.includes(accountId)) {
      return res.status(404).json({ error: 'Cuenta no encontrada' })
    }

    const where: Prisma.OrderWhereInput = {
      accountId: { in: accountId ? [accountId] : userAccountIds },
      side: { in: ['BUY', 'SELL'] },
      ...(groupId ? { groupId } : {}),
      ...(source ? { source } : {}),
      // Si se pide un status explícito (ej: awaiting_manual del panel manual) úsarlo;
      // si no, excluir órdenes saltadas — la bitácora solo muestra órdenes en firme.
      ...(status ? { status } : { status: { not: 'skipped' } }),
    }

    const dateFrom = parseDateBoundary(date, false)
    const dateTo = parseDateBoundary(date, true)
    if (dateFrom && dateTo) {
      where.createdAt = { gte: dateFrom, lte: dateTo }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          account: true,
          signal: { select: { id: true, source: true, seqNumber: true, timeframe: true, screenshotUrl: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      prisma.order.count({ where }),
    ])

    res.json({
      orders: orders.map((o) => ({ ...o, account: stripAccountTokens(o.account) })),
      total,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/orders/:id/submit — envía una orden awaiting_manual al broker
router.post('/:id/submit', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id },
      include: { account: true, signal: { select: { price: true } } },
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
    if (order.account.userId !== req.user!.id) return res.status(403).json({ error: 'Acceso denegado' })
    if (order.status !== 'awaiting_manual') {
      return res.status(400).json({ error: 'La orden no está pendiente de envío' })
    }

    await prisma.order.update({ where: { id: order.id }, data: { status: 'pending' } })
    await enqueueOrder({
      orderId: order.id,
      accountId: order.accountId,
      signalId: order.signalId,
      symbol: order.symbol,
      action: order.side,
      qty: order.qty,
      sl: order.sl ?? null,
      tp: order.tp ?? null,
      price: order.signal?.price ?? null,
    })

    res.json({ ok: true, orderId: order.id })
  } catch (err) {
    next(err)
  }
})

// POST /api/orders/:id/expire — descarta una orden awaiting_manual (timeout)
router.post('/:id/expire', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id },
      include: { account: true },
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
    if (order.account.userId !== req.user!.id) return res.status(403).json({ error: 'Acceso denegado' })
    if (order.status !== 'awaiting_manual') return res.json({ ok: true })

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'skipped', skipReason: 'MANUAL_TIMEOUT' },
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
