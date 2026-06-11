import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const SessionString = z.string().regex(
  /^\d{2}:\d{2}-\d{2}:\d{2}$/,
  'Formato de sesión inválido. Use HH:MM-HH:MM (ej: 08:30-15:00 o 19:00-03:00)'
)

const RulesSchema = z.object({
  accountStage: z.string().optional(),           // 'challenge' | 'funded_to_withdrawal' | 'funded_active' | 'recurso_propio' | custom
  company: z.string().optional(),                // 'apex' | custom text
  riskMode: z.enum(['fixed_usd', 'pct_balance']).optional(),
  fixedRiskAmount: z.number().positive().optional(),
  maxEntriesPerDay: z.number().int().min(1).optional(),
  allowedDays: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).optional(),
  // Legacy single-window (kept for backwards compat)
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  // New: multi-session array ["HH:MM-HH:MM", ...] — supports cross-midnight
  allowedSessions: z.array(SessionString).optional(),
  // No-trade zones: blocked regardless of allowedSessions
  blockedSessions: z.array(SessionString).optional(),
  maxDrawdownPct: z.number().min(0).max(100).optional(),
  reduceRiskAfterLosses: z.boolean().optional(),
  reduceRiskFactor: z.number().min(0).max(1).optional(),
  maxConsecutiveLosses: z.number().int().min(1).optional(),
  pauseAfterMaxLosses: z.boolean().optional(),
})

router.get('/:accountId/rules', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.accountId, userId: req.user!.id },
    })
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' })

    const rules = await prisma.tradingRules.findUnique({ where: { accountId: req.params.accountId } })
    res.json(rules)
  } catch (err) { next(err) }
})

router.put('/:accountId/rules', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.accountId, userId: req.user!.id },
    })
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' })

    const data = RulesSchema.parse(req.body)
    const rules = await prisma.tradingRules.upsert({
      where: { accountId: req.params.accountId },
      update: data,
      create: { accountId: req.params.accountId, ...data },
    })
    res.json(rules)
  } catch (err) { next(err) }
})

export default router
