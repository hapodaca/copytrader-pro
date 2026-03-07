import { Router, Response } from 'express';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';

export const accountsRouter = Router();

// GET / — list accounts for authenticated user
accountsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId! },
      include: {
        tradingRules: true,
        dailyStats: {
          where: {
            date: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: accounts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — create account
accountsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, tradovateId, tradovateSpec, environment, brokerType } = req.body;

    if (!name || !tradovateId || !tradovateSpec) {
      res.status(400).json({ success: false, error: 'name, tradovateId, y tradovateSpec son requeridos' });
      return;
    }

    const account = await prisma.account.create({
      data: {
        userId: req.userId!,
        name,
        tradovateId,
        tradovateSpec,
        environment: environment || 'demo',
        brokerType: brokerType || 'tradovate',
      },
    });

    res.status(201).json({ success: true, data: account });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ success: false, error: 'tradovateId ya está registrado' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — get single account
accountsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: {
        tradingRules: true,
        dailyStats: {
          orderBy: { date: 'desc' },
          take: 7,
        },
      },
    });

    if (!account) {
      res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
      return;
    }

    res.json({ success: true, data: account });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id — update account
accountsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
      return;
    }

    const { name, tradovateSpec, environment, isActive } = req.body;

    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(tradovateSpec !== undefined && { tradovateSpec }),
        ...(environment !== undefined && { environment }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: account });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id — soft delete
accountsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
      return;
    }

    await prisma.account.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'Cuenta desactivada' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id/balance — get balance
accountsRouter.get('/:id/balance', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      select: { id: true, balance: true, name: true },
    });

    if (!account) {
      res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
      return;
    }

    res.json({ success: true, data: { balance: account.balance } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
