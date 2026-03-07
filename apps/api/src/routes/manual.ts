import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { AuthRequest } from '../middleware/auth';
import { processSignal } from '../services/copyRouter';

export const manualRouter = Router();

const ManualSignalSchema = z.object({
  groupId: z.string().min(1),
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT']),
  qty: z.number().int().positive().optional(),
});

// POST /signal
manualRouter.post('/signal', async (req: AuthRequest, res: Response) => {
  try {
    const payload = ManualSignalSchema.parse(req.body);

    // Verify group belongs to user
    const group = await prisma.copyGroup.findFirst({
      where: { id: payload.groupId, userId: req.userId! },
    });

    if (!group) {
      res.status(404).json({ success: false, error: 'Grupo no encontrado' });
      return;
    }

    // Create signal
    const signal = await prisma.signal.create({
      data: {
        userId: req.userId!,
        source: 'manual',
        symbol: payload.symbol,
        action: payload.action,
        price: 0, // Manual signals don't have a price
        contracts: payload.qty,
        rawPayload: req.body,
        status: 'received',
      },
    });

    // Process through copy router with specific group
    processSignal(signal, req.userId!, payload.groupId).catch((err) => {
      console.error(`Manual signal processing failed for ${signal.id}:`, err.message);
    });

    res.json({ success: true, data: signal });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Payload inválido', details: error.errors });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});
