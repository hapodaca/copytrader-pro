import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateQty } from '../src/services/riskEngine';

// Mock BrokerRegistry
vi.mock('../src/integrations/broker/BrokerRegistry', () => ({
  BrokerRegistry: {
    get: vi.fn(() => ({
      getBalance: vi.fn(),
      getInitialMargin: vi.fn(),
    })),
  },
}));

// Mock scheduleFilter
vi.mock('../src/services/scheduleFilter', () => ({
  getDailyStats: vi.fn(),
  toChicagoTime: vi.fn(() => ({
    dayOfWeek: 'MON',
    time: '10:00',
    date: new Date('2024-01-15'),
  })),
}));

import { BrokerRegistry } from '../src/integrations/broker/BrokerRegistry';
import { getDailyStats } from '../src/services/scheduleFilter';

const makeFollower = (brokerType = 'tradovate') => ({
  followerAccountId: 'account-1',
  riskPct: 1.0,
  follower: {
    id: 'account-1',
    tradovateId: '12345',
    tradovateSpec: 'spec',
    environment: 'demo',
    accessToken: 'token',
    refreshToken: 'refresh',
    tokenExpiry: new Date(Date.now() + 3600000),
    brokerType,
  },
});

describe('riskEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should calculate qty correctly with fixed_usd mode ($650 / $40 = 16)', async () => {
    const mockBroker = {
      getBalance: vi.fn().mockResolvedValue(50000),
      getInitialMargin: vi.fn().mockResolvedValue(40),
    };
    (BrokerRegistry.get as any).mockReturnValue(mockBroker);
    (getDailyStats as any).mockResolvedValue({ consecutiveLosses: 0 });

    const qty = await calculateQty(
      makeFollower(),
      { symbol: 'MNQZ24' },
      { riskMode: 'fixed_usd', fixedRiskAmount: 650, reduceRiskAfterLosses: false, reduceRiskFactor: 0.5 }
    );

    expect(qty).toBe(16); // floor(650/40) = 16
  });

  it('should calculate qty correctly with pct_balance mode', async () => {
    const mockBroker = {
      getBalance: vi.fn().mockResolvedValue(5000),
      getInitialMargin: vi.fn().mockResolvedValue(40),
    };
    (BrokerRegistry.get as any).mockReturnValue(mockBroker);
    (getDailyStats as any).mockResolvedValue({ consecutiveLosses: 0 });

    const follower = { ...makeFollower(), riskPct: 1.0 };

    const qty = await calculateQty(
      follower,
      { symbol: 'MNQZ24' },
      { riskMode: 'pct_balance', fixedRiskAmount: 650, reduceRiskAfterLosses: false, reduceRiskFactor: 0.5 }
    );

    expect(qty).toBe(1); // floor(5000 * 0.01 / 40) = floor(50/40) = 1
  });

  it('should reduce risk after 2 consecutive losses with factor 0.5', async () => {
    const mockBroker = {
      getBalance: vi.fn().mockResolvedValue(50000),
      getInitialMargin: vi.fn().mockResolvedValue(40),
    };
    (BrokerRegistry.get as any).mockReturnValue(mockBroker);
    (getDailyStats as any).mockResolvedValue({ consecutiveLosses: 2 });

    const qty = await calculateQty(
      makeFollower(),
      { symbol: 'MNQZ24' },
      { riskMode: 'fixed_usd', fixedRiskAmount: 650, reduceRiskAfterLosses: true, reduceRiskFactor: 0.5 }
    );

    // riskAmount = 650 * (0.5 ^ 2) = 650 * 0.25 = 162.5
    // qty = floor(162.5 / 40) = 4
    expect(qty).toBe(4);
  });

  it('should return 0 when balance insufficient', async () => {
    const mockBroker = {
      getBalance: vi.fn().mockResolvedValue(10),
      getInitialMargin: vi.fn().mockResolvedValue(500),
    };
    (BrokerRegistry.get as any).mockReturnValue(mockBroker);
    (getDailyStats as any).mockResolvedValue({ consecutiveLosses: 0 });

    const qty = await calculateQty(
      makeFollower(),
      { symbol: 'ESH25' },
      { riskMode: 'pct_balance', fixedRiskAmount: 650, reduceRiskAfterLosses: false, reduceRiskFactor: 0.5 }
    );

    // balance=10, 1% = 0.1, floor(0.1/500) = 0
    expect(qty).toBe(0);
  });

  it('should return 0 when margin is 0', async () => {
    const mockBroker = {
      getBalance: vi.fn().mockResolvedValue(50000),
      getInitialMargin: vi.fn().mockResolvedValue(0),
    };
    (BrokerRegistry.get as any).mockReturnValue(mockBroker);

    const qty = await calculateQty(
      makeFollower(),
      { symbol: 'UNKNOWN' },
      { riskMode: 'fixed_usd', fixedRiskAmount: 650, reduceRiskAfterLosses: false, reduceRiskFactor: 0.5 }
    );

    expect(qty).toBe(0);
  });
});
