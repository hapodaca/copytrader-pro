import { Account, Signal } from '@prisma/client'
import { BrokerAdapter, BrokerCredentials, PlacedOrder, Position, BrokerEvent } from '../BrokerAdapter'
import * as tradovateOrders from './orders'
import * as tradovateAccount from './account'
import { wsManager } from './websocket'
import { ensureValidToken } from './auth'

export class TradovateAdapter implements BrokerAdapter {
  readonly brokerName = 'tradovate'

  async connect(credentials: BrokerCredentials): Promise<void> {
    // La conexión OAuth ya se manejó en el flujo de callback
    // Este método puede usarse para verificar que el token es válido
    console.log(`Conectando cuenta Tradovate ${credentials.accountId}`)
  }

  async placeOrder(
    account: Account,
    signal: Pick<Signal, 'symbol' | 'action' | 'sl' | 'tp'>,
    qty: number
  ): Promise<PlacedOrder> {
    return tradovateOrders.placeOrder(account, signal, qty)
  }

  async cancelOrder(account: Account, orderId: string): Promise<void> {
    return tradovateOrders.cancelOrder(account, orderId)
  }

  async getBalance(account: Account): Promise<number> {
    return tradovateAccount.getBalance(account)
  }

  async getPositions(account: Account): Promise<Position[]> {
    return tradovateAccount.getPositions(account)
  }

  async getInitialMargin(symbol: string, environment = 'demo'): Promise<number> {
    return tradovateAccount.getInitialMargin(symbol, environment)
  }

  subscribeToUpdates(account: Account, cb: (event: BrokerEvent) => void): void {
    wsManager.connect(account, cb)
  }
}
