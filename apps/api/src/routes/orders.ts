import { Router, Response } from 'express';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';

export const ordersRouter = Router();

// GET / — paginated order list
ordersRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const accountId = req.query.accountId as string | undefined;
    const status = req.query.status as string | undefined;
    const date = req.query.date as string | undefined;

    // Get user's account IDs for filtering
    const userAccounts = await prisma.account.findMany({
      where: { userId: req.userId! },
      select: { id: true },
    });
    const userAccountIds = userAccounts.map((a) => a.id);

    const where: any = { accountId: { in: userAccountIds } };
    if (accountId) where.accountId = accountId;
    if (status) where.status = status;
    if (date) {
      const dateStart = new Date(date);
      const dateEnd = new Date(date);
      dateEnd.setDate(dateEnd.getDate() + 1);
      where.createdAt = { gte: dateStart, lt: dateEnd };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          signal: { select: { id: true, symbol: true, action: true, source: true } },
          account: { select: { id: true, name: true, tradovateId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ success: true, data: orders, total, limit, offset });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
