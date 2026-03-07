import { Router, Response } from 'express';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';

export const statsRouter = Router();

// GET /daily — daily stats
statsRouter.get('/daily', async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.query.accountId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // Get user's account IDs
    const userAccounts = await prisma.account.findMany({
      where: { userId: req.userId! },
      select: { id: true },
    });
    const userAccountIds = userAccounts.map((a) => a.id);

    const where: any = { accountId: { in: userAccountIds } };
    if (accountId) where.accountId = accountId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const stats = await prisma.dailyStat.findMany({
      where,
      include: {
        account: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });

    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
