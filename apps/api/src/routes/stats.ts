import { Router, Response, NextFunction } from 'express'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { stripAccountTokens } from '../utils/sanitizeAccount'

const router = Router()

// Summary for Dashboard home — aggregated across all user accounts for today
router.get('/summary', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const uid = req.user!.id

    // Get user's account IDs first to avoid nested relation filters
    const userAccounts = await prisma.account.findMany({
      where: { userId: uid },
      select: { id: true, name: true, isActive: true },
    })
    const accountIds = userAccounts.map((a) => a.id)
    const activeAccountsCount = userAccounts.filter((a) => a.isActive).length

    const [signalsToday, ordersExecuted, todayStats] = await Promise.all([
      prisma.signal.count({ where: { userId: uid, createdAt: { gte: today } } }),
      accountIds.length > 0
        ? prisma.order.count({ where: { accountId: { in: accountIds }, status: 'filled', createdAt: { gte: today } } })
        : Promise.resolve(0),
      accountIds.length > 0
        ? prisma.dailyStat.findMany({
            where: { accountId: { in: accountIds }, date: { gte: today } },
            include: { account: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ])

    const totalPnl = todayStats.reduce((sum, s) => sum + s.pnl, 0)
    const pausedAccounts = todayStats.filter((s) => s.isPaused).map((s) => s.account.name)

    res.json({ activeAccounts: activeAccountsCount, signalsToday, ordersExecuted, totalPnl, pausedAccounts })
  } catch (err) {
    next(err)
  }
})

router.get('/daily', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { accountId, from, to } = req.query as Record<string, string | undefined>

    const fromDate = from ? new Date(from) : undefined
    const toDate = to ? new Date(to) : undefined

    if ((from && Number.isNaN(fromDate!.getTime())) || (to && Number.isNaN(toDate!.getTime()))) {
      return res.status(400).json({ error: 'Parámetros de fecha inválidos' })
    }

    const userAccounts = await prisma.account.findMany({
      where: { userId: req.user!.id },
      select: { id: true },
    })
    const userAccountIds = userAccounts.map((a) => a.id)

    // Solo permitir filtrar por cuentas propias
    if (accountId && !userAccountIds.includes(accountId)) {
      return res.status(404).json({ error: 'Cuenta no encontrada' })
    }

    const stats = await prisma.dailyStat.findMany({
      where: {
        accountId: { in: accountId ? [accountId] : userAccountIds },
        ...(fromDate || toDate
          ? {
              date: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'desc' },
      include: { account: true },
    })
    res.json(stats.map((s) => ({ ...s, account: stripAccountTokens(s.account) })))
  } catch (err) {
    next(err)
  }
})

export default router
