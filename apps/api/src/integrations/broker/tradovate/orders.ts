import axios from 'axios'
import Bottleneck from 'bottleneck'
import { Account, Signal } from '@prisma/client'
import { ensureValidToken, getBaseUrl } from './auth'
import { PlacedOrder } from '../BrokerAdapter'

// Rate limit: max 10 req/seg por cuenta (requerimiento Tradovate)
const limiters = new Map<string, Bottleneck>()

function getLimiter(accountId: string): Bottleneck {
  if (!limiters.has(accountId)) {
    limiters.set(accountId, new Bottleneck({ minTime: 100, maxConcurrent: 1 }))
  }
  return limiters.get(accountId)!
}

const ACTION_MAP: Record<string, string> = {
  BUY:         'Buy',
  SELL:        'Sell',
  CLOSE_LONG:  'Sell',
  CLOSE_SHORT: 'Buy',
}

// Acción opuesta para los brackets (SL/TP siempre son la dirección contraria)
const BRACKET_ACTION: Record<string, string> = {
  Buy:  'Sell',
  Sell: 'Buy',
}

export async function placeOrder(
  account: Account,
  signal: Pick<Signal, 'symbol' | 'action' | 'sl' | 'tp'>,
  qty: number
): Promise<PlacedOrder> {
  const token   = await ensureValidToken(account)
  const baseUrl = getBaseUrl(account.environment)
  const action  = ACTION_MAP[signal.action] ?? signal.action
  const limiter = getLimiter(account.id)

  const base = {
    accountSpec: account.tradovateSpec,
    accountId:   Number(account.tradovateId),
    action,
    symbol:      signal.symbol,
    orderQty:    qty,
    isAutomated: true, // OBLIGATORIO por regulación CME
  }

  // ── Con SL y/o TP → bracket order (placeOSO) ──────────────────────
  if (signal.sl || signal.tp) {
    const bracketAction = BRACKET_ACTION[action] ?? action
    const brackets: Record<string, unknown>[] = []

    if (signal.tp) {
      brackets.push({
        action:    bracketAction,
        orderType: 'Limit',
        price:     signal.tp,
        orderQty:  qty,
      })
    }
    if (signal.sl) {
      brackets.push({
        action:     bracketAction,
        orderType:  'Stop',
        stopPrice:  signal.sl,
        orderQty:   qty,
      })
    }

    const osoPayload: Record<string, unknown> = {
      entryOrder: { ...base, orderType: 'Market' },
    }
    if (brackets[0]) osoPayload.bracket1 = brackets[0]
    if (brackets[1]) osoPayload.bracket2 = brackets[1]

    const { data } = await limiter.schedule(() =>
      axios.post(`${baseUrl}/order/placeOSO`, osoPayload, {
        headers: { Authorization: `Bearer ${token}` },
      })
    )
    return { orderId: String(data.orderId), status: data.orderStatus ?? 'Working' }
  }

  // ── Sin SL/TP → orden de mercado simple ───────────────────────────
  const { data } = await limiter.schedule(() =>
    axios.post(
      `${baseUrl}/order/placeorder`,
      { ...base, orderType: 'Market' },
      { headers: { Authorization: `Bearer ${token}` } }
    )
  )
  return { orderId: String(data.orderId), status: data.orderStatus ?? 'Working' }
}

export async function cancelOrder(account: Account, orderId: string): Promise<void> {
  const token   = await ensureValidToken(account)
  const baseUrl = getBaseUrl(account.environment)
  await axios.post(
    `${baseUrl}/order/cancelorder`,
    { orderId: Number(orderId) },
    { headers: { Authorization: `Bearer ${token}` } }
  )
}
