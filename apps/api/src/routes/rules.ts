import { Router, Response } from 'express';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';

export const rulesRouter = Router();

// GET /:accountId — get rules for account
rulesRouter.get('/:accountId', async (req: AuthRequest, res: Response) => {
  try {
    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: req.params.accountId, userId: req.userId! },
    });

    if (!account) {
      res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
      return;
    }

    const rules = await prisma.tradingRules.findUnique({
      where: { accountId: req.params.accountId },
    });

    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:accountId — upsert rules
rulesRouter.put('/:accountId', async (req: AuthRequest, res: Response) => {
  try {
    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: { id: req.params.accountId, userId: req.userId! },
    });

    if (!account) {
      res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
      return;
    }

    const {
      accountStage,
      riskMode,
      fixedRiskAmount,
      maxEntriesPerDay,
      allowedDays,
      startTime,
      endTime,
      maxDrawdownPct,
      reduceRiskAfterLosses,
      reduceRiskFactor,
      maxConsecutiveLosses,
      pauseAfterMaxLosses,
    } = req.body;

    const data = {
      ...(accountStage !== undefined && { accountStage }),
      ...(riskMode !== undefined && { riskMode }),
      ...(fixedRiskAmount !== undefined && { fixedRiskAmount }),
      ...(maxEntriesPerDay !== undefined && { maxEntriesPerDay }),
      ...(allowedDays !== undefined && { allowedDays }),
      ...(startTime !== undefined && { startTime }),
      ...(endTime !== undefined && { endTime }),
      ...(maxDrawdownPct !== undefined && { maxDrawdownPct }),
      ...(reduceRiskAfterLosses !== undefined && { reduceRiskAfterLosses }),
      ...(reduceRiskFactor !== undefined && { reduceRiskFactor }),
      ...(maxConsecutiveLosses !== undefined && { maxConsecutiveLosses }),
      ...(pauseAfterMaxLosses !== undefined && { pauseAfterMaxLosses }),
    };

    const rules = await prisma.tradingRules.upsert({
      where: { accountId: req.params.accountId },
      update: data,
      create: { accountId: req.params.accountId, ...data },
    });

    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
