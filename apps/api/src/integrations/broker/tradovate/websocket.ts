import WebSocket from 'ws'
import { Account } from '@prisma/client'
import { prisma } from '../../../db/client'
import { BrokerEvent } from '../BrokerAdapter'
import { ensureValidToken, getBaseUrl } from './auth'

const WS_URLS = {
  demo: 'wss://demo.tradovateapi.com/v1/websocket',
  live: 'wss://live.tradovateapi.com/v1/websocket',
}

type EventCallback = (event: BrokerEvent) => void

export class TradovateWebSocketManager {
  private connections = new Map<string, WebSocket>()
  private callbacks = new Map<string, EventCallback>()
  private reconnectAttempts = new Map<string, number>()

  async connect(account: Account, cb: EventCallback): Promise<void> {
    this.callbacks.set(account.id, cb)
    await this.createConnection(account)
  }

  private async createConnection(account: Account): Promise<void> {
    const token = await ensureValidToken(account)
    const wsUrl = account.environment === 'live' ? WS_URLS.live : WS_URLS.demo
    const ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      this.reconnectAttempts.set(account.id, 0)
      // Autenticar y sincronizar
      ws.send(`authorize\n1\n\n${token}`)
      ws.send('user/syncrequest\n2\n\n{}')
    })

    ws.on('message', (data: Buffer) => {
      this.handleMessage(account.id, data.toString())
    })

    ws.on('close', () => {
      this.scheduleReconnect(account)
    })

    ws.on('error', (err) => {
      console.error(`WebSocket error cuenta ${account.id}:`, err.message)
    })

    // Heartbeat cada 2500ms
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('[]')
    }, 2500)

    ws.on('close', () => clearInterval(heartbeat))

    this.connections.set(account.id, ws)
  }

  private handleMessage(accountId: string, raw: string): void {
    if (!raw || raw === 'o' || raw.startsWith('h')) return
    const cb = this.callbacks.get(accountId)
    if (!cb) return

    try {
      const frames = JSON.parse(raw.slice(1)) as Array<{ e: string; d: unknown }>
      for (const frame of frames) {
        if (!frame.e) continue
        if (frame.e === 'fill') {
          cb({ type: 'order_fill', accountId, data: frame.d as Record<string, unknown> })
          this.handleOrderFill(accountId, frame.d as Record<string, unknown>)
        } else if (frame.e === 'position') {
          cb({ type: 'position_change', accountId, data: frame.d as Record<string, unknown> })
        } else if (frame.e === 'account') {
          cb({ type: 'account_update', accountId, data: frame.d as Record<string, unknown> })
          this.handleAccountUpdate(accountId, frame.d as Record<string, unknown>)
        }
      }
    } catch {
      // ignorar frames malformados
    }
  }

  private async handleOrderFill(accountId: string, data: Record<string, unknown>): Promise<void> {
    const tradovateOrderId = String(data.orderId)
    await prisma.order.updateMany({
      where: { tradovateOrderId, accountId },
      data: { status: 'filled', fillPrice: data.price as number },
    })
  }

  private async handleAccountUpdate(accountId: string, data: Record<string, unknown>): Promise<void> {
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: data.totalCashValue as number },
    })
  }

  private scheduleReconnect(account: Account): void {
    const attempts = (this.reconnectAttempts.get(account.id) ?? 0) + 1
    this.reconnectAttempts.set(account.id, attempts)
    const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000)
    setTimeout(() => this.createConnection(account), delay)
  }

  disconnect(accountId: string): void {
    this.connections.get(accountId)?.close()
    this.connections.delete(accountId)
    this.callbacks.delete(accountId)
  }
}

export const wsManager = new TradovateWebSocketManager()
