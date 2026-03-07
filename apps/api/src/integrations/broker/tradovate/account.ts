import { getBaseUrl, tokenManager } from './auth';
import { BrokerAccount, Position } from '../BrokerAdapter';

export async function getCashBalance(account: BrokerAccount): Promise<number> {
  const accessToken = await tokenManager.ensureValidToken(account);
  const baseUrl = getBaseUrl(account.environment);

  const response = await fetch(
    `${baseUrl}/cashBalance/getCashBalanceSnapshot?accountId=${account.tradovateId}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get cash balance: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, any>;
  return data.cashBalance ?? data.totalCashValue ?? 0;
}

export async function getPositions(account: BrokerAccount): Promise<Position[]> {
  const accessToken = await tokenManager.ensureValidToken(account);
  const baseUrl = getBaseUrl(account.environment);

  const response = await fetch(`${baseUrl}/position/list`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get positions: ${response.status}`);
  }

  const data = await response.json();
  return (data as any[]).map((p) => ({
    symbol: p.contractId?.toString() || '',
    netPos: p.netPos || 0,
    avgPrice: p.avgPrice || 0,
  }));
}
