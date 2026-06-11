import { Request } from 'express'
import { Signal } from '@prisma/client'

export interface ParsedSignal {
  symbol: string
  action: 'BUY' | 'SELL' | 'CLOSE_LONG' | 'CLOSE_SHORT'
  price: number
  contracts?: number
  strategy?: string
  timeframe?: string
}

export interface SignalSource {
  readonly sourceName: string
  parseSignal(payload: unknown): ParsedSignal
  validateAuth(req: Request): boolean
}
