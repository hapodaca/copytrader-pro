import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { getBaseUrl, tokenManager } from './auth';
import { BrokerAccount } from '../BrokerAdapter';
import prisma from '../../../db/client';

interface WSConnection {
  ws: WebSocket;
  heartbeatInterval: NodeJS.Timeout;
  reconnectAttempts: number;
  accountId: string;
}

export class TradovateWebSocketManager extends EventEmitter {
  private connections: Map<string, WSConnection> = new Map();
  private maxReconnectDelay = 30000;

  async connect(account: BrokerAccount): Promise<void> {
    if (this.connections.has(account.id)) {
      return;
    }

    const wsUrl = account.environment === 'live'
      ? 'wss://live.tradovateapi.com/v1/websocket'
      : 'wss://demo.tradovateapi.com/v1/websocket';

    await this.createConnection(account, wsUrl, 0);
  }

  private async createConnection(account: BrokerAccount, wsUrl: string, reconnectAttempts: number): Promise<void> {
    const ws = new WebSocket(wsUrl);

    const connection: WSConnection = {
      ws,
      heartbeatInterval: null as any,
      reconnectAttempts,
      accountId: account.id,
    };

    ws.on('open', async () => {
      connection.reconnectAttempts = 0;

      // Authenticate
      try {
        const accessToken = await tokenManager.ensureValidToken(account);
        ws.send(`authorize\n0\n\n${accessToken}`);
      } catch (err) {
        console.error(`WS auth failed for account ${account.id}:`, (err as Error).message);
        ws.close();
        return;
      }

      // Heartbeat every 2500ms
      connection.heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('[]');
        }
      }, 2500);

      // Request sync
      ws.send('user/syncrequest\n1\n\n{}');

      this.emit('connected', account.id);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = data.toString();
        this.handleMessage(account.id, msg);
      } catch {
        // Ignore parse errors for heartbeat responses
      }
    });

    ws.on('close', () => {
      this.cleanup(account.id);
      this.scheduleReconnect(account, wsUrl, connection.reconnectAttempts);
    });

    ws.on('error', (err) => {
      console.error(`WS error for account ${account.id}:`, err.message);
    });

    this.connections.set(account.id, connection);
  }

  private handleMessage(accountId: string, raw: string): void {
    // Tradovate WS messages have format: event\nid\n\ndata
    const lines = raw.split('\n');
    if (lines.length < 4) return;

    try {
      const data = JSON.parse(lines.slice(3).join('\n'));

      if (Array.isArray(data)) {
        for (const event of data) {
          if (event.e === 'order' && event.d?.ordStatus === 'Filled') {
            this.emit('order_fill', {
              accountId,
              orderId: String(event.d.id),
              fillPrice: event.d.avgPx || event.d.price,
              status: 'filled',
            });
            this.updateOrderFill(event.d);
          }

          if (event.e === 'position') {
            this.emit('position_change', {
              accountId,
              symbol: event.d.contractId,
              netPos: event.d.netPos,
            });
          }

          if (event.e === 'cashBalance') {
            this.updateAccountBalance(accountId, event.d.cashBalance || event.d.totalCashValue);
          }
        }
      }
    } catch {
      // Not JSON, might be heartbeat response
    }
  }

  private async updateOrderFill(data: any): Promise<void> {
    try {
      const tradovateOrderId = String(data.id);
      await prisma.order.updateMany({
        where: { tradovateOrderId },
        data: {
          status: 'filled',
          fillPrice: data.avgPx || data.price || 0,
        },
      });
    } catch {
      // Order might not exist in our DB
    }
  }

  private async updateAccountBalance(accountId: string, balance: number): Promise<void> {
    try {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance },
      });
    } catch {
      // Account might not exist
    }
  }

  private cleanup(accountId: string): void {
    const conn = this.connections.get(accountId);
    if (conn) {
      clearInterval(conn.heartbeatInterval);
      this.connections.delete(accountId);
    }
  }

  private scheduleReconnect(account: BrokerAccount, wsUrl: string, attempts: number): void {
    const delay = Math.min(1000 * Math.pow(2, attempts), this.maxReconnectDelay);
    setTimeout(() => {
      this.createConnection(account, wsUrl, attempts + 1).catch((err) => {
        console.error(`WS reconnect failed for ${account.id}:`, err.message);
      });
    }, delay);
  }

  disconnect(accountId: string): void {
    const conn = this.connections.get(accountId);
    if (conn) {
      clearInterval(conn.heartbeatInterval);
      conn.ws.close();
      this.connections.delete(accountId);
    }
  }

  disconnectAll(): void {
    for (const [accountId] of this.connections) {
      this.disconnect(accountId);
    }
  }
}

export const wsManager = new TradovateWebSocketManager();
