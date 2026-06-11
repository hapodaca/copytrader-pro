import { Account, Signal } from '@prisma/client'
import { randomUUID } from 'crypto'
import {
  BrokerAdapter, BrokerCredentials, BrokerEvent, PlacedOrder, Position,
} from '../BrokerAdapter'

// Márgenes iniciales aproximados por familia de símbolo (USD)
const MARGIN_MAP: Record<string, number> = {
  MNQ: 40,    // Micro Nasdaq
  NQ:  2000,  // E-mini Nasdaq
  MES: 50,    // Micro S&P 500
  ES:  1000,  // E-mini S&P 500
  MYM: 50,    // Micro Dow
  YM:  1000,  // E-mini Dow
  MGC: 100,   // Micro Gold
  GC:  1500,  // Gold
  MCL: 150,   // Micro Crude Oil
  CL:  1500,  // Crude Oil
  MBT: 500,   // Micro Bitcoin
  BTC: 5000,  // Bitcoin
  MET: 200,   // Micro Ether
}

function getMarginForSymbol(symbol: string): number {
  // Strip contract month/year suffix (e.g. MNQZ25 → MNQ)
  const root = symbol.replace(/[A-Z]{0,1}\d{2}$/, '')
  return MARGIN_MAP[root] ?? 100
}

export class PaperBrokerAdapter implements BrokerAdapter {
  readonly brokerName = 'paper'

  async connect(_credentials: BrokerCredentials): Promise<void> {
    // Paper mode — no real connection needed
  }

  async placeOrder(
    _account: Account,
    signal: Pick<Signal, 'symbol' | 'action' | 'sl' | 'tp'>,
    qty: number,
  ): Promise<PlacedOrder> {
    const paperId = `paper-${randomUUID().slice(0, 8)}`
    const slTp = [signal.sl ? `SL=${signal.sl}` : '', signal.tp ? `TP=${signal.tp}` : ''].filter(Boolean).join(' ')
    console.log(`[Paper] Order placed: ${signal.action} ${qty}x ${signal.symbol}${slTp ? ` (${slTp})` : ''} → ${paperId}`)
    return { orderId: paperId, status: 'filled' }
  }

  async cancelOrder(_account: Account, orderId: string): Promise<void> {
    console.log(`[Paper] Order cancelled: ${orderId}`)
  }

  async getBalance(account: Account): Promise<number> {
    // Usar el balance almacenado (o 50.000 por defecto)
    return account.balance > 0 ? account.balance : 50_000
  }

  async getPositions(_account: Account): Promise<Position[]> {
    return []
  }

  async getInitialMargin(symbol: string): Promise<number> {
    return getMarginForSymbol(symbol)
  }

  subscribeToUpdates(_account: Account, _cb: (event: BrokerEvent) => void): void {
    // Paper mode — no WebSocket updates
  }
}
