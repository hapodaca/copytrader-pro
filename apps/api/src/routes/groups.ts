import { Router, Response } from 'express';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';

export const groupsRouter = Router();

// GET / — list groups for user
groupsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.copyGroup.findMany({
      where: { userId: req.userId! },
      include: {
        master: { select: { id: true, name: true, tradovateId: true, environment: true } },
        followers: {
          include: {
            follower: { select: { id: true, name: true, tradovateId: true, environment: true, isActive: true, balance: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: groups });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — create group
groupsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, masterAccountId, distributionMode, batchSize } = req.body;

    if (!name || !masterAccountId) {
      res.status(400).json({ success: false, error: 'name y masterAccountId son requeridos' });
      return;
    }

    // Verify master account belongs to user
    const master = await prisma.account.findFirst({
      where: { id: masterAccountId, userId: req.userId! },
    });

    if (!master) {
      res.status(404).json({ success: false, error: 'Cuenta master no encontrada' });
      return;
    }

    const group = await prisma.copyGroup.create({
      data: {
        userId: req.userId!,
        name,
        masterAccountId,
        distributionMode: distributionMode || 'all',
        batchSize: batchSize || 4,
      },
      include: { master: true, followers: true },
    });

    res.status(201).json({ success: true, data: group });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id — update group
groupsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.copyGroup.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Grupo no encontrado' });
      return;
    }

    const { name, distributionMode, batchSize, isActive } = req.body;

    const group = await prisma.copyGroup.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(distributionMode !== undefined && { distributionMode }),
        ...(batchSize !== undefined && { batchSize }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { master: true, followers: true },
    });

    res.json({ success: true, data: group });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/followers — add follower
groupsRouter.post('/:id/followers', async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.copyGroup.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!group) {
      res.status(404).json({ success: false, error: 'Grupo no encontrado' });
      return;
    }

    const { followerAccountId, riskPct, rotateOrder } = req.body;

    // Verify follower account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: followerAccountId, userId: req.userId! },
    });

    if (!account) {
      res.status(404).json({ success: false, error: 'Cuenta follower no encontrada' });
      return;
    }

    const follower = await prisma.groupFollower.create({
      data: {
        groupId: req.params.id,
        followerAccountId,
        riskPct: riskPct || 1.0,
        rotateOrder: rotateOrder || 0,
      },
      include: { follower: true },
    });

    res.status(201).json({ success: true, data: follower });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id/followers/:fid — update follower
groupsRouter.put('/:id/followers/:fid', async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.copyGroup.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!group) {
      res.status(404).json({ success: false, error: 'Grupo no encontrado' });
      return;
    }

    const { riskPct, rotateOrder, isActive } = req.body;

    const follower = await prisma.groupFollower.update({
      where: { id: req.params.fid },
      data: {
        ...(riskPct !== undefined && { riskPct }),
        ...(rotateOrder !== undefined && { rotateOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { follower: true },
    });

    res.json({ success: true, data: follower });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id/followers/:fid — remove follower
groupsRouter.delete('/:id/followers/:fid', async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.copyGroup.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!group) {
      res.status(404).json({ success: false, error: 'Grupo no encontrado' });
      return;
    }

    await prisma.groupFollower.delete({ where: { id: req.params.fid } });
    res.json({ success: true, message: 'Follower eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
