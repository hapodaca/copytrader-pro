import { Account, Signal } from '@prisma/client'

export interface BrokerCredentials {
  accessToken: string
  refreshToken?: string
  accountId: string
  environment: 'demo' | 'live'
}

export interface PlacedOrder {
  orderId: string
  status: string
  fillPrice?: number | null  // precio real de ejecución si el broker lo reporta
}

export interface Position {
  symbol: string
  side: 'long' | 'short'
  qty: number
  avgPrice: number
}

export type BrokerEventType = 'order_fill' | 'position_change' | 'account_update'

export interface BrokerEvent {
  type: BrokerEventType
  accountId: string
  data: Record<string, unknown>
}

export interface BrokerAdapter {
  readonly brokerName: string
  connect(credentials: BrokerCredentials): Promise<void>
  placeOrder(account: Account, signal: Pick<Signal, 'symbol' | 'action' | 'sl' | 'tp'>, qty: number): Promise<PlacedOrder>
  cancelOrder(account: Account, orderId: string): Promise<void>
  getBalance(account: Account): Promise<number>
  getPositions(account: Account): Promise<Position[]>
  getInitialMargin(symbol: string): Promise<number>
  subscribeToUpdates(account: Account, cb: (event: BrokerEvent) => void): void
}
