import { BrokerAdapter, BrokerAccount, BrokerSignal, BrokerOrder, Position, BrokerEvent } from '../BrokerAdapter';
import { tokenManager } from './auth';
import { tradovateOrderService } from './orders';
import { getCashBalance, getPositions } from './account';
import { getInitialMargin } from './contracts';
import { wsManager } from './websocket';

export class TradovateAdapter implements BrokerAdapter {
  readonly brokerName = 'tradovate';

  async connect(credentials: { accessToken: string; refreshToken: string; environment: string }): Promise<void> {
    // Connection is managed per-account via TokenManager
  }

  async placeOrder(account: BrokerAccount, signal: BrokerSignal, qty: number): Promise<BrokerOrder> {
    return tradovateOrderService.placeOrder(account, signal, qty);
  }

  async cancelOrder(account: BrokerAccount, orderId: string): Promise<void> {
    return tradovateOrderService.cancelOrder(account, orderId);
  }

  async getBalance(account: BrokerAccount): Promise<number> {
    return getCashBalance(account);
  }

  async getPositions(account: BrokerAccount): Promise<Position[]> {
    return getPositions(account);
  }

  async getInitialMargin(symbol: string): Promise<number> {
    // Use a dummy account for margin queries — margin is environment-specific
    // In practice, we'll use the first active account's credentials
    return getInitialMargin(
      { id: '', tradovateId: '', tradovateSpec: '', environment: 'demo', accessToken: null, refreshToken: null, tokenExpiry: null },
      symbol
    );
  }

  subscribeToUpdates(account: BrokerAccount, cb: (event: BrokerEvent) => void): void {
    wsManager.connect(account).catch((err) => {
      console.error(`WS connect failed for ${account.id}:`, err.message);
    });

    wsManager.on('order_fill', (data: any) => {
      if (data.accountId === account.id) {
        cb({ type: 'order_fill', data });
      }
    });

    wsManager.on('position_change', (data: any) => {
      if (data.accountId === account.id) {
        cb({ type: 'position_change', data });
      }
    });
  }
}
