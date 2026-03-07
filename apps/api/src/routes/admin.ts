import { Router, Response } from 'express';
import prisma from '../db/client';
import { AuthRequest, adminMiddleware } from '../middleware/auth';

export const adminRouter = Router();

// All admin routes require admin role
adminRouter.use(adminMiddleware);

// GET /users — list all users
adminRouter.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        webhookToken: true,
        _count: { select: { accounts: true } },
        subscription: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /users/:id — user detail
adminRouter.get('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        webhookToken: true,
        accounts: {
          include: {
            tradingRules: true,
            dailyStats: {
              orderBy: { date: 'desc' },
              take: 7,
            },
          },
        },
        subscription: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /users/:id — update user
adminRouter.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { isActive, role } = req.body;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(role !== undefined && { role }),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /metrics — global platform metrics
adminRouter.get('/metrics', async (_req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsers, activeUsers, totalAccounts, signalsToday, ordersToday] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.account.count(),
      prisma.signal.count({ where: { createdAt: { gte: today } } }),
      prisma.order.count({ where: { createdAt: { gte: today } } }),
    ]);

    res.json({
      success: true,
      data: { totalUsers, activeUsers, totalAccounts, signalsToday, ordersToday },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
