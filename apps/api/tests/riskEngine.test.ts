import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindUnique, mockGetBalance, mockGetInitialMargin } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockGetBalance: vi.fn(),
  mockGetInitialMargin: vi.fn(),
}))

vi.mock('../src/db/client', () => ({
  prisma: {
    dailyStat: { findUnique: mockFindUnique },
  },
}))

// Mock BrokerRegistry — devuelve un adapter con getBalance y getInitialMargin
vi.mock('../src/integrations/broker/BrokerRegistry', () => ({
  BrokerRegistry: {
    get: () => ({
      getBalance: mockGetBalance,
      getInitialMargin: mockGetInitialMargin,
    }),
  },
}))

import { calculateQty } from '../src/services/riskEngine'
import { Account, TradingRules } from '@prisma/client'

const mockAccount = { id: 'acc1', brokerType: 'paper', environment: 'demo', balance: 0 } as Account

const baseRules = {
  id: 'r1', accountId: 'acc1',
  accountStage: 'challenge', riskMode: 'fixed_usd', fixedRiskAmount: 650,
  maxEntriesPerDay: 3, allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  startTime: '08:00', endTime: '15:30',
  maxDrawdownPct: 5, reduceRiskAfterLosses: false, reduceRiskFactor: 0.5,
  maxConsecutiveLosses: 3, pauseAfterMaxLosses: true,
  createdAt: new Date(), updatedAt: new Date(),
} as TradingRules

beforeEach(() => {
  mockFindUnique.mockReset()
  mockGetBalance.mockReset()
  mockGetInitialMargin.mockReset()
})

describe('riskEngine - calculateQty', () => {
  it('fixed_usd: $650 / margin $40 = 16', async () => {
    mockGetBalance.mockResolvedValue(50000)
    mockGetInitialMargin.mockResolvedValue(40)

    const qty = await calculateQty(mockAccount, 'MNQU25', 1.0, baseRules)
    expect(qty).toBe(16) // floor(650 / 40) = 16
  })

  it('pct_balance: balance $5000 × 1% / margin $40 = 1', async () => {
    mockGetBalance.mockResolvedValue(5000)
    mockGetInitialMargin.mockResolvedValue(40)

    const qty = await calculateQty(mockAccount, 'MNQU25', 1.0, {
      ...baseRules, riskMode: 'pct_balance',
    })
    expect(qty).toBe(1) // floor(5000 * 0.01 / 40) = 1
  })

  it('reduce risk after 2 consecutive losses (factor 0.5): floor(162.5 / 40) = 4', async () => {
    mockGetBalance.mockResolvedValue(50000)
    mockGetInitialMargin.mockResolvedValue(40)
    mockFindUnique.mockResolvedValue({ consecutiveLosses: 2 })

    const qty = await calculateQty(mockAccount, 'MNQU25', 1.0, {
      ...baseRules, reduceRiskAfterLosses: true,
    })
    // 650 * (0.5^2) = 162.5 → floor(162.5/40) = 4
    expect(qty).toBe(4)
  })

  it('pct_balance insuficiente → 0', async () => {
    mockGetBalance.mockResolvedValue(10)
    mockGetInitialMargin.mockResolvedValue(500)

    const qty = await calculateQty(mockAccount, 'ESH25', 1.0, {
      ...baseRules, riskMode: 'pct_balance',
    })
    expect(qty).toBe(0) // floor(0.1/500) = 0
  })

  it('margin = 0 → 0', async () => {
    mockGetBalance.mockResolvedValue(50000)
    mockGetInitialMargin.mockResolvedValue(0)

    const qty = await calculateQty(mockAccount, 'UNKNOWN', 1.0, baseRules)
    expect(qty).toBe(0)
  })
})
