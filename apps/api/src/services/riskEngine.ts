import { BrokerRegistry } from '../integrations/broker/BrokerRegistry';
import { getDailyStats, toChicagoTime } from './scheduleFilter';

interface RiskRules {
  riskMode: string;
  fixedRiskAmount: number;
  reduceRiskAfterLosses: boolean;
  reduceRiskFactor: number;
}

interface FollowerInfo {
  followerAccountId: string;
  riskPct: number;
  follower: {
    id: string;
    tradovateId: string;
    tradovateSpec: string;
    environment: string;
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiry: Date | null;
    brokerType: string;
  };
}

export async function calculateQty(
  follower: FollowerInfo,
  signal: { symbol: string },
  rules: RiskRules
): Promise<number> {
  const broker = BrokerRegistry.get(follower.follower.brokerType);
  const balance = await broker.getBalance(follower.follower);
  const margin = await broker.getInitialMargin(signal.symbol);

  if (margin <= 0) return 0;

  // riskMode: 'fixed_usd' para challenge/funded Apex
  //           'pct_balance' para modo libre
  let riskAmount = rules.riskMode === 'fixed_usd'
    ? rules.fixedRiskAmount
    : balance * (follower.riskPct / 100);

  // Reducción por losses consecutivos
  if (rules.reduceRiskAfterLosses) {
    const now = toChicagoTime(new Date());
    const stats = await getDailyStats(follower.followerAccountId, now.date);
    riskAmount *= Math.pow(rules.reduceRiskFactor, stats.consecutiveLosses);
  }

  return Math.max(0, Math.floor(riskAmount / margin));
}
