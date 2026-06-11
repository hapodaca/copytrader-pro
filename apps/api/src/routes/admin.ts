import { Router, Response } from 'express'
import { prisma } from '../db/client'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'
import { createClient } from '@supabase/supabase-js'

const router = Router()
const getSupabase = (() => {
  let client: ReturnType<typeof createClient> | null = null
  return () => client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
})()

// ── Settings (readable by any authenticated user) ─────────────────────────────
router.get('/settings', requireAuth, async (_req: AuthRequest, res: Response, next) => {
  try {
    const configs = await prisma.systemConfig.findMany()
    const settings: Record<string, string> = {}
    for (const c of configs) settings[c.key] = c.value
    res.json(settings)
  } catch (err) { next(err) }
})

// ── All other admin endpoints require admin role ───────────────────────────────
router.use(requireAuth, requireAdmin)

router.patch('/settings', async (req: AuthRequest, res: Response, next) => {
  try {
    const updates = req.body as Record<string, string>
    for (const [key, value] of Object.entries(updates)) {
      await prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }
    const configs = await prisma.systemConfig.findMany()
    const settings: Record<string, string> = {}
    for (const c of configs) settings[c.key] = c.value
    res.json(settings)
  } catch (err) { next(err) }
})

router.get('/users', async (_req: AuthRequest, res: Response, next) => {
  try {
    const profiles = await prisma.profile.findMany({
      include: {
        accounts: { select: { id: true, name: true, environment: true, isActive: true } },
        subscription: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Obtener emails de Supabase Auth
    const { data: { users: authUsers } } = await getSupabase().auth.admin.listUsers()
    const emailMap = new Map(authUsers.map(u => [u.id, u.email]))

    const result = profiles.map(p => ({
      id: p.id,
      email: emailMap.get(p.id) ?? 'desconocido',
      plan: p.subscription?.plan ?? 'free',
      isActive: p.isActive,
      createdAt: p.createdAt,
      accounts: p.accounts,
      _count: { accounts: p.accounts.length },
    }))
    res.json(result)
  } catch (err) { next(err) }
})

router.get('/users/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: req.params.id },
      include: {
        accounts: { include: { tradingRules: true, dailyStats: { take: 7, orderBy: { date: 'desc' } } } },
        subscription: true,
      },
    })
    if (!profile) return res.status(404).json({ error: 'Usuario no encontrado' })

    // Get email from Supabase
    const { data: { user: authUser } } = await getSupabase().auth.admin.getUserById(req.params.id)

    res.json({
      id: profile.id,
      email: authUser?.email ?? 'desconocido',
      plan: profile.subscription?.plan ?? 'free',
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      accounts: profile.accounts,
    })
  } catch (err) { next(err) }
})

router.patch('/users/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const { isActive, role, plan, status } = req.body as Record<string, unknown>
    if (role !== undefined && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Rol inválido — debe ser "admin" o "user"' })
    }
    const profile = await prisma.profile.update({
      where: { id: req.params.id },
      data: {
        ...(typeof isActive === 'boolean' ? { isActive } : {}),
        ...(typeof role === 'string' ? { role } : {}),
      },
    })
    if (plan || status) {
      await prisma.subscription.upsert({
        where: { userId: req.params.id },
        update: { ...(plan ? { plan: plan as string } : {}), ...(status ? { status: status as string } : {}) },
        create: { userId: req.params.id, plan: (plan as string) ?? 'monthly' },
      })
    }
    res.json({ ...profile, plan: (plan as string) ?? 'free' })
  } catch (err) { next(err) }
})

router.get('/metrics', async (_req: AuthRequest, res: Response, next) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [totalUsers, totalSignalsToday, totalOrdersToday, activeAccounts] = await Promise.all([
      prisma.profile.count(),
      prisma.signal.count({ where: { createdAt: { gte: today } } }),
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.account.count({ where: { isActive: true } }),
    ])
    res.json({ totalUsers, totalSignalsToday, totalOrdersToday, activeAccounts })
  } catch (err) { next(err) }
})

export default router
