import { getBaseUrl, tokenManager } from './auth';
import { BrokerAccount } from '../BrokerAdapter';

const marginCache: Map<string, { value: number; expiry: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getInitialMargin(account: BrokerAccount, symbol: string): Promise<number> {
  const cacheKey = `${account.environment}:${symbol}`;
  const cached = marginCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  const accessToken = await tokenManager.ensureValidToken(account);
  const baseUrl = getBaseUrl(account.environment);

  // Find contract
  const contractRes = await fetch(`${baseUrl}/contract/find?name=${encodeURIComponent(symbol)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!contractRes.ok) {
    throw new Error(`Failed to find contract ${symbol}: ${contractRes.status}`);
  }

  const contract = (await contractRes.json()) as Record<string, any>;
  const contractGroupId = contract.contractGroupId;

  if (!contractGroupId) {
    throw new Error(`No contract group found for ${symbol}`);
  }

  // Get contract group for margin info
  const groupRes = await fetch(`${baseUrl}/contractGroup/item?id=${contractGroupId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!groupRes.ok) {
    throw new Error(`Failed to get contract group: ${groupRes.status}`);
  }

  const group = (await groupRes.json()) as Record<string, any>;
  const margin = group.initialMargin || group.dayInitialMargin || 500;

  marginCache.set(cacheKey, { value: margin, expiry: Date.now() + CACHE_TTL });
  return margin;
}
