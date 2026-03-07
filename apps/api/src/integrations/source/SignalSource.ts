import { Request } from 'express';

export interface ParsedSignal {
  symbol: string;
  action: string;
  price: number;
  contracts?: number;
  strategy?: string;
  timeframe?: string;
}

export interface SignalSource {
  readonly sourceName: string;
  parseSignal(payload: unknown): ParsedSignal;
  validateAuth(req: Request): boolean;
}
