import { Router, Response } from 'express'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

function parseDay(input: string | undefined): Date | null {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null
  return new Date(`${input}T00:00:00.000Z`)
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&accountId=...
// KPIs del período + serie diaria (equity) + desglose por símbolo y por cuenta
router.get('/summary', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const q = req.query as Record<string, string>

    // Rango por defecto: últimos 30 días
    const today = new Date()
    const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29))
    const from = parseDay(q.from) ?? defaultFrom
    const toDay = parseDay(q.to) ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const toEnd = new Date(toDay.getTime() + 24 * 3600 * 1000 - 1)

    const accounts = await prisma.account.findMany({
      where: { userId: req.user!.id },
      select: { id: true, name: true },
    })
    const userAccountIds = accounts.map((a) => a.id)
    const nameById = new Map(accounts.map((a) => [a.id, a.name]))

    // Solo permitir filtrar por cuentas propias
    if (q.accountId && !userAccountIds.includes(q.accountId)) {
      return res.status(404).json({ error: 'Cuenta no encontrada' })
    }
    const selectedIds = q.accountId ? [q.accountId] : userAccountIds

    const [stats, orders] = await Promise.all([
      prisma.dailyStat.findMany({
        where: { accountId: { in: selectedIds }, date: { gte: from, lte: toEnd } },
        orderBy: { date: 'asc' },
      }),
      // Mismo criterio que la Bitácora: entradas BUY/SELL en firme (sin saltadas)
      prisma.order.findMany({
        where: {
          accountId: { in: selectedIds },
          createdAt: { gte: from, lte: toEnd },
          side: { in: ['BUY', 'SELL'] },
          status: { not: 'skipped' },
        },
        select: { symbol: true, winLoss: true, accountId: true },
      }),
    ])

    // ── Serie diaria agregada (todas las cuentas seleccionadas) ──────────────
    const dayMap = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>()
    for (const s of stats) {
      const key = dayKey(s.date)
      const d = dayMap.get(key) ?? { pnl: 0, trades: 0, wins: 0, losses: 0 }
      d.pnl += s.pnl
      d.trades += s.entriesCount
      d.wins += s.winCount
      d.losses += s.lossCount
      dayMap.set(key, d)
    }

    let cumPnl = 0
    const series = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d, cumPnl: Number((cumPnl += d.pnl).toFixed(2)) }))

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const totalPnl = series.reduce((sum, d) => sum + d.pnl, 0)
    const wins = series.reduce((sum, d) => sum + d.wins, 0)
    const losses = series.reduce((sum, d) => sum + d.losses, 0)
    const trades = series.reduce((sum, d) => sum + d.trades, 0)
    const tradingDays = series.filter((d) => d.trades > 0).length

    let bestDay: { date: string; pnl: number } | null = null
    let worstDay: { date: string; pnl: number } | null = null
    for (const d of series) {
      if (!bestDay || d.pnl > bestDay.pnl) bestDay = { date: d.date, pnl: d.pnl }
      if (!worstDay || d.pnl < worstDay.pnl) worstDay = { date: d.date, pnl: d.pnl }
    }

    // ── Desglose por símbolo (órdenes ejecutadas) ─────────────────────────────
    const symbolMap = new Map<string, { trades: number; wins: number; losses: number }>()
    for (const o of orders) {
      const s = symbolMap.get(o.symbol) ?? { trades: 0, wins: 0, losses: 0 }
      s.trades++
      if (o.winLoss === 'W') s.wins++
      else if (o.winLoss === 'L') s.losses++
      symbolMap.set(o.symbol, s)
    }
    const bySymbol = [...symbolMap.entries()]
      .map(([symbol, s]) => ({
        symbol,
        ...s,
        winRate: s.wins + s.losses > 0 ? Number(((s.wins / (s.wins + s.losses)) * 100).toFixed(1)) : null,
      }))
      .sort((a, b) => b.trades - a.trades)

    // ── Desglose por cuenta (DailyStat) ───────────────────────────────────────
    const accountMap = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>()
    for (const s of stats) {
      const a = accountMap.get(s.accountId) ?? { pnl: 0, trades: 0, wins: 0, losses: 0 }
      a.pnl += s.pnl
      a.trades += s.entriesCount
      a.wins += s.winCount
      a.losses += s.lossCount
      accountMap.set(s.accountId, a)
    }
    const byAccount = [...accountMap.entries()]
      .map(([accountId, a]) => ({
        accountId,
        accountName: nameById.get(accountId) ?? accountId,
        pnl: Number(a.pnl.toFixed(2)),
        trades: a.trades,
        wins: a.wins,
        losses: a.losses,
        winRate: a.wins + a.losses > 0 ? Number(((a.wins / (a.wins + a.losses)) * 100).toFixed(1)) : null,
      }))
      .sort((a, b) => b.pnl - a.pnl)

    res.json({
      from: dayKey(from),
      to: dayKey(toDay),
      kpis: {
        totalPnl: Number(totalPnl.toFixed(2)),
        trades,
        wins,
        losses,
        winRate: wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : null,
        tradingDays,
        avgDailyPnl: tradingDays > 0 ? Number((totalPnl / tradingDays).toFixed(2)) : 0,
        bestDay,
        worstDay,
      },
      series,
      bySymbol,
      byAccount,
    })
  } catch (err) {
    next(err)
  }
})

export default router
