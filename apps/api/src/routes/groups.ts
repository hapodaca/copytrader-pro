import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { stripAccountTokens } from '../utils/sanitizeAccount'

const router = Router()

const GroupSchema = z.object({
  name: z.string().min(1),
  masterAccountId: z.string().optional(),   // opcional — master es un rol conceptual
  distributionMode: z.enum(['all', 'rotate', 'rotate_group', 'batch_rotate']).default('all'),
  batchSize: z.number().int().min(1).max(50).default(4),
  isActive: z.boolean().optional(),
  symbol: z.string().optional(),            // filtro opcional de ticker
  tipoGrupo: z.enum(['copy_group', 'master']).default('copy_group'),
  orderMode: z.enum(['auto', 'manual']).default('auto'),
})

const FollowerSchema = z.object({
  // Accept both field names for compatibility (frontend sends accountId, schema calls it followerAccountId)
  followerAccountId: z.string().optional(),
  accountId: z.string().optional(),
  riskPct: z.number().min(0).max(500).default(100),
  rotateOrder: z.number().int().default(0),
}).transform(data => ({
  followerAccountId: data.followerAccountId ?? data.accountId ?? '',
  riskPct: data.riskPct,
  rotateOrder: data.rotateOrder,
})).refine(data => !!data.followerAccountId, { message: 'Se requiere una cuenta' })

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const groups = await prisma.copyGroup.findMany({
      where: { userId: req.user!.id },
      include: {
        master: true,
        followers: {
          include: { follower: true },
          orderBy: { rotateOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    // Normalize response shape for frontend
    const normalized = groups.map(g => ({
      ...g,
      master: stripAccountTokens(g.master),
      masterAccount: stripAccountTokens(g.master),
      followers: g.followers.map(f => ({
        ...f,
        accountId: f.followerAccountId,
        follower: stripAccountTokens(f.follower),
        account: stripAccountTokens(f.follower),
      })),
    }))
    res.json(normalized)
  } catch (err) { next(err) }
})

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const data = GroupSchema.parse(req.body)
    // Si se especificó una cuenta master, verificar que pertenece al usuario
    if (data.masterAccountId) {
      const master = await prisma.account.findFirst({
        where: { id: data.masterAccountId, userId: req.user!.id, isActive: true },
      })
      if (!master) return res.status(404).json({ error: 'Cuenta master no encontrada' })
    }
    const group = await prisma.copyGroup.create({ data: { ...data, userId: req.user!.id } })
    res.status(201).json(group)
  } catch (err) { next(err) }
})

router.put('/:id', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const group = await prisma.copyGroup.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    })
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' })
    const data = GroupSchema.partial().parse(req.body)
    const updated = await prisma.copyGroup.update({ where: { id: req.params.id }, data })
    res.json(updated)
  } catch (err) { next(err) }
})

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const group = await prisma.copyGroup.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    })
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' })
    await prisma.copyGroup.update({ where: { id: req.params.id }, data: { isActive: false } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.post('/:id/followers', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const group = await prisma.copyGroup.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    })
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' })

    const data = FollowerSchema.parse(req.body)

    // Verify follower account belongs to user
    const followerAcct = await prisma.account.findFirst({
      where: { id: data.followerAccountId, userId: req.user!.id, isActive: true },
    })
    if (!followerAcct) return res.status(404).json({ error: 'Cuenta seguidor no encontrada' })

    const follower = await prisma.groupFollower.create({
      data: { groupId: req.params.id, ...data },
      include: { follower: true },
    })
    res.status(201).json({ ...follower, follower: stripAccountTokens(follower.follower) })
  } catch (err) { next(err) }
})

// Verifica que el follower pertenece a un grupo del usuario autenticado
async function findOwnFollower(fid: string, groupId: string, userId: string) {
  return prisma.groupFollower.findFirst({
    where: { id: fid, groupId, group: { userId } },
  })
}

router.put('/:id/followers/:fid', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const existing = await findOwnFollower(req.params.fid, req.params.id, req.user!.id)
    if (!existing) return res.status(404).json({ error: 'Seguidor no encontrado' })

    const data = z.object({
      riskPct: z.number().min(0).max(500).optional(),
      rotateOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body)
    const follower = await prisma.groupFollower.update({ where: { id: req.params.fid }, data })
    res.json(follower)
  } catch (err) { next(err) }
})

router.delete('/:id/followers/:fid', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const existing = await findOwnFollower(req.params.fid, req.params.id, req.user!.id)
    if (!existing) return res.status(404).json({ error: 'Seguidor no encontrado' })

    await prisma.groupFollower.delete({ where: { id: req.params.fid } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
