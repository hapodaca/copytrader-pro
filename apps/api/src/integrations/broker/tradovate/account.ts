import axios from 'axios'
import { Account } from '@prisma/client'
import { ensureValidToken, getBaseUrl } from './auth'
import { Position } from '../BrokerAdapter'

export async function getBalance(account: Account): Promise<number> {
  const token = await ensureValidToken(account)
  const baseUrl = getBaseUrl(account.environment)
  const { data } = await axios.get(`${baseUrl}/cashBalance/getCashBalanceSnapshot`, {
    params: { accountId: Number(account.tradovateId) },
    headers: { Authorization: `Bearer ${token}` },
  })
  return data.totalCashValue ?? 0
}

export async function getPositions(account: Account): Promise<Position[]> {
  const token = await ensureValidToken(account)
  const baseUrl = getBaseUrl(account.environment)
  const { data } = await axios.get(`${baseUrl}/position/list`, {
    params: { accountId: Number(account.tradovateId) },
    headers: { Authorization: `Bearer ${token}` },
  })
  return (data ?? []).map((p: Record<string, unknown>) => ({
    symbol: p.contractId as string,
    side: (p.netPos as number) > 0 ? 'long' : 'short',
    qty: Math.abs(p.netPos as number),
    avgPrice: p.netPrice as number,
  }))
}

export async function getInitialMargin(symbol: string, environment: string): Promise<number> {
  const baseUrl = environment === 'live'
    ? 'https://live.tradovateapi.com/v1'
    : 'https://demo.tradovateapi.com/v1'
  try {
    const { data } = await axios.get(`${baseUrl}/contract/find`, { params: { name: symbol } })
    return data?.initialMargin ?? 500
  } catch {
    return 500 // fallback seguro
  }
}
