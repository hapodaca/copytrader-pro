import { Router, Request, Response } from 'express';
import prisma from '../db/client';
import { validateWebhookPayload, validateWebhookSecret } from '../services/signalValidator';
import { processSignal } from '../services/copyRouter';

export const webhookRouter = Router();

// TradingView allowed IPs
function getAllowedIPs(): string[] {
  const envIPs = process.env.TV_ALLOWED_IPS;
  if (envIPs) return envIPs.split(',').map((ip) => ip.trim());
  return ['52.89.214.238', '34.212.75.30', '54.218.53.128', '52.32.178.7'];
}

// Deduplication cache: key -> timestamp
const recentSignals: Map<string, number> = new Map();
const DEDUP_WINDOW_MS = 5000;

// Cleanup old dedup entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentSignals) {
    if (now - timestamp > DEDUP_WINDOW_MS * 2) {
      recentSignals.delete(key);
    }
  }
}, 60000);

// POST /:webhookToken
webhookRouter.post('/:webhookToken', async (req: Request, res: Response) => {
  try {
    // 1. IP whitelist (skip in development)
    if (process.env.NODE_ENV !== 'development') {
      const clientIP = req.ip || req.socket.remoteAddress || '';
      const cleanIP = clientIP.replace('::ffff:', '');
      const allowedIPs = getAllowedIPs();
      if (!allowedIPs.includes(cleanIP)) {
        res.status(403).json({ success: false, error: 'IP not allowed' });
        return;
      }
    }

    // 2. Find user by webhookToken
    const user = await prisma.user.findUnique({
      where: { webhookToken: req.params.webhookToken },
    });

    if (!user || !user.isActive) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }

    // 3. Validate payload with Zod
    const payload = validateWebhookPayload(req.body);

    // 4. Verify webhook secret
    if (!validateWebhookSecret(payload)) {
      res.status(401).json({ success: false, error: 'Invalid secret' });
      return;
    }

    // 5. Deduplication check
    const dedupKey = `${user.id}:${payload.symbol}:${payload.action}`;
    const lastSeen = recentSignals.get(dedupKey);
    if (lastSeen && Date.now() - lastSeen < DEDUP_WINDOW_MS) {
      // Save as rejected duplicate
      await prisma.signal.create({
        data: {
          userId: user.id,
          source: 'tradingview',
          symbol: payload.symbol,
          action: payload.action,
          price: payload.price,
          contracts: payload.contracts,
          strategy: payload.strategy,
          timeframe: payload.timeframe,
          rawPayload: req.body,
          status: 'rejected',
          rejectReason: 'DUPLICATE',
        },
      });
      res.status(200).json({ success: true, message: 'Duplicate signal ignored' });
      return;
    }
    recentSignals.set(dedupKey, Date.now());

    // 6. Save signal to DB
    const signal = await prisma.signal.create({
      data: {
        userId: user.id,
        source: 'tradingview',
        symbol: payload.symbol,
        action: payload.action,
        price: payload.price,
        contracts: payload.contracts,
        strategy: payload.strategy,
        timeframe: payload.timeframe,
        rawPayload: req.body,
        status: 'received',
      },
    });

    // 7. Respond 200 OK immediately (< 500ms)
    res.status(200).json({ success: true, signalId: signal.id });

    // 8. Process asynchronously
    processSignal(signal, user.id).catch((err) => {
      console.error(`Signal processing failed for ${signal.id}:`, err.message);
      prisma.signal.update({
        where: { id: signal.id },
        data: { status: 'rejected', rejectReason: err.message },
      }).catch(() => {});
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Payload inválido', details: error.errors });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});
