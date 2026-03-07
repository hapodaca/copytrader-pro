import { Request } from 'express';
import { z } from 'zod';
import { SignalSource, ParsedSignal } from './SignalSource';

const TradingViewPayloadSchema = z.object({
  secret: z.string(),
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT']),
  price: z.number().positive(),
  contracts: z.number().int().positive().optional(),
  strategy: z.string().optional(),
  timeframe: z.string().optional(),
  timestamp: z.string().optional(),
});

export class TradingViewSource implements SignalSource {
  readonly sourceName = 'tradingview';

  parseSignal(payload: unknown): ParsedSignal {
    const parsed = TradingViewPayloadSchema.parse(payload);
    return {
      symbol: parsed.symbol,
      action: parsed.action,
      price: parsed.price,
      contracts: parsed.contracts,
      strategy: parsed.strategy,
      timeframe: parsed.timeframe,
    };
  }

  validateAuth(req: Request): boolean {
    const body = req.body;
    return body?.secret === process.env.WEBHOOK_SECRET;
  }
}

export const tradingViewSource = new TradingViewSource();
