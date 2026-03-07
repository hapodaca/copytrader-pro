import { Router, Response } from 'express';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';

export const signalsRouter = Router();

// GET / — paginated signal list
signalsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const symbol = req.query.symbol as string | undefined;

    const where: any = { userId: req.userId! };
    if (status) where.status = status;
    if (symbol) where.symbol = { contains: symbol, mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [signals, total] = await Promise.all([
      prisma.signal.findMany({
        where,
        include: { _count: { select: { orders: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.signal.count({ where }),
    ]);

    res.json({ success: true, data: signals, total, limit, offset });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — signal detail with orders
signalsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const signal = await prisma.signal.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: {
        orders: {
          include: {
            account: { select: { id: true, name: true, tradovateId: true } },
          },
        },
      },
    });

    if (!signal) {
      res.status(404).json({ success: false, error: 'Señal no encontrada' });
      return;
    }

    res.json({ success: true, data: signal });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
