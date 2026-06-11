import { Router, Response } from 'express'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { BrokerRegistry } from '../integrations/broker/BrokerRegistry'
import { stripAccountTokens } from '../utils/sanitizeAccount'

const router = Router()

const AccountSchema = z.object({
  name: z.string().min(1),
  tradovateId: z.string().optional(),
  tradovateSpec: z.string().optional(),
  environment: z.enum(['demo', 'live']).default('demo'),
  brokerType: z.enum(['tradovate', 'paper']).default('tradovate'),
  tradovateUsername: z.string().optional(),
  accountStage: z.string().nullable().optional(),
  balance: z.number().optional(),
})

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user!.id, isActive: true },
      include: { tradingRules: true, dailyStats: { orderBy: { date: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(accounts.map(stripAccountTokens))
  } catch (err) { next(err) }
})

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const data = AccountSchema.parse(req.body)
    const isPaper = data.brokerType === 'paper'

    const account = await prisma.account.create({
      data: {
        userId: req.user!.id,
        name: data.name,
        brokerType: data.brokerType,
        tradovateUsername: isPaper ? null : (data.tradovateUsername ?? null),
        accountStage: isPaper ? null : (data.accountStage ?? null),
        environment: isPaper ? 'demo' : (data.environment ?? 'demo'),
        tradovateId: isPaper ? `paper-${randomUUID().slice(0, 8)}` : (data.tradovateId ?? ''),
        tradovateSpec: isPaper ? 'paper' : (data.tradovateSpec ?? ''),
        accessToken: isPaper ? 'paper-mode' : undefined,
        balance: isPaper ? (data.balance ?? 50_000) : 0,
      },
    })
    res.status(201).json(stripAccountTokens(account))
  } catch (err) { next(err) }
})

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { tradingRules: true },
    })
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' })
    res.json(stripAccountTokens(account))
  } catch (err) { next(err) }
})

router.put('/:id', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    })
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' })
    const data = AccountSchema.partial().parse(req.body)
    const account = await prisma.account.update({ where: { id: req.params.id }, data })
    res.json(stripAccountTokens(account))
  } catch (err) { next(err) }
})

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    })
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' })
    await prisma.account.update({ where: { id: req.params.id }, data: { isActive: false } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.get('/:id/balance', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    })
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' })
    if (!account.accessToken) return res.status(400).json({ error: 'Cuenta sin token — conectar primero' })

    const broker = BrokerRegistry.get(account.brokerType)
    const balance = await broker.getBalance(account)

    if (account.brokerType !== 'paper') {
      await prisma.account.update({ where: { id: account.id }, data: { balance } })
    }

    res.json({ balance })
  } catch (err) { next(err) }
})

export default router
