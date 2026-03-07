import Bottleneck from 'bottleneck';
import { getBaseUrl } from './auth';
import { tokenManager } from './auth';
import { BrokerAccount, BrokerOrder } from '../BrokerAdapter';

const limiters: Map<string, Bottleneck> = new Map();

function getLimiter(accountId: string): Bottleneck {
  let limiter = limiters.get(accountId);
  if (!limiter) {
    limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 100, // 10 requests per second
    });
    limiters.set(accountId, limiter);
  }
  return limiter;
}

function mapAction(action: string): string {
  switch (action) {
    case 'BUY': return 'Buy';
    case 'SELL': return 'Sell';
    case 'CLOSE_LONG': return 'Sell';
    case 'CLOSE_SHORT': return 'Buy';
    default: return action;
  }
}

export class TradovateOrderService {
  async placeOrder(account: BrokerAccount, signal: { symbol: string; action: string }, qty: number): Promise<BrokerOrder> {
    const accessToken = await tokenManager.ensureValidToken(account);
    const baseUrl = getBaseUrl(account.environment);
    const limiter = getLimiter(account.id);

    const result = await limiter.schedule(async () => {
      const response = await fetch(`${baseUrl}/order/placeorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          accountSpec: account.tradovateSpec,
          accountId: parseInt(account.tradovateId),
          action: mapAction(signal.action),
          symbol: signal.symbol,
          orderQty: qty,
          orderType: 'Market',
          isAutomated: true, // CME regulation requirement
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tradovate placeOrder failed (${response.status}): ${errorText}`);
      }

      return (await response.json()) as Record<string, any>;
    });

    return {
      orderId: String(result.orderId || result.id),
      status: result.orderStatus || 'sent',
      fillPrice: result.fillPrice,
    };
  }

  async cancelOrder(account: BrokerAccount, orderId: string): Promise<void> {
    const accessToken = await tokenManager.ensureValidToken(account);
    const baseUrl = getBaseUrl(account.environment);
    const limiter = getLimiter(account.id);

    await limiter.schedule(async () => {
      const response = await fetch(`${baseUrl}/order/cancelorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId: parseInt(orderId) }),
      });

      if (!response.ok) {
        throw new Error(`Tradovate cancelOrder failed: ${response.status}`);
      }
    });
  }
}

export const tradovateOrderService = new TradovateOrderService();
