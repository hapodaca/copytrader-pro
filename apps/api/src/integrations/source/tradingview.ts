import { Request } from 'express'
import { z } from 'zod'
import { SignalSource, ParsedSignal } from './SignalSource'

const TradingViewPayload = z.object({
  secret: z.string(),
  symbol: z.string().min(1),
  action: z.enum(['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT']),
  price: z.number().positive(),
  contracts: z.number().int().positive().optional(),
  strategy: z.string().optional(),
  timeframe: z.string().optional(),
  timestamp: z.string().optional(),
})

export class TradingViewSource implements SignalSource {
  readonly sourceName = 'tradingview'

  parseSignal(payload: unknown): ParsedSignal {
    const data = TradingViewPayload.parse(payload)
    return {
      symbol: data.symbol,
      action: data.action,
      price: data.price,
      contracts: data.contracts,
      strategy: data.strategy,
      timeframe: data.timeframe,
    }
  }

  validateAuth(req: Request): boolean {
    const body = req.body as Record<string, unknown>
    return body?.secret === process.env.WEBHOOK_SECRET
  }
}

export const tradingViewSource = new TradingViewSource()
