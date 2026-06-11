import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}))

vi.mock('../src/db/client', () => ({
  prisma: {
    dailyStat: { findUnique: mockFindUnique },
  },
}))

import { canTrade } from '../src/services/scheduleFilter'
import { TradingRules } from '@prisma/client'

const baseRules = {
  id: 'r1', accountId: 'acc1',
  accountStage: 'challenge', riskMode: 'fixed_usd', fixedRiskAmount: 650,
  maxEntriesPerDay: 3, allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  startTime: '08:00', endTime: '15:30',
  maxDrawdownPct: 5, reduceRiskAfterLosses: true, reduceRiskFactor: 0.5,
  maxConsecutiveLosses: 3, pauseAfterMaxLosses: true,
} as TradingRules

beforeEach(() => { mockFindUnique.mockReset() })

describe('scheduleFilter - canTrade', () => {
  it('día no permitido → DIA_NO_PERMITIDO', async () => {
    // Domingo: allowedDays no incluye SUN
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/12/2025, 10:00:00 AM')
    mockFindUnique.mockResolvedValue(null)
    const result = await canTrade('acc1', { ...baseRules, allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'] })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('DIA_NO_PERMITIDO')
    vi.restoreAllMocks()
  })

  it('fuera de horario → FUERA_DE_HORARIO', async () => {
    // Ventana imposible: 23:00-23:30
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/13/2025, 10:00:00 AM')
    mockFindUnique.mockResolvedValue(null)
    const result = await canTrade('acc1', {
      ...baseRules, allowedDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'],
      startTime: '23:00', endTime: '23:30',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('FUERA_DE_HORARIO')
    vi.restoreAllMocks()
  })

  it('max entradas alcanzado → MAX_ENTRADAS_DIA', async () => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/13/2025, 10:00:00 AM')
    mockFindUnique.mockResolvedValue({ entriesCount: 3, drawdownPct: 0, consecutiveLosses: 0 })
    const result = await canTrade('acc1', {
      ...baseRules, allowedDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'],
      startTime: '00:00', endTime: '23:59', maxEntriesPerDay: 3,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('MAX_ENTRADAS_DIA')
    vi.restoreAllMocks()
  })

  it('drawdown superado → MAX_DRAWDOWN', async () => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/13/2025, 10:00:00 AM')
    mockFindUnique.mockResolvedValue({ entriesCount: 1, drawdownPct: 6.0, consecutiveLosses: 0 })
    const result = await canTrade('acc1', {
      ...baseRules, allowedDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'],
      startTime: '00:00', endTime: '23:59',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('MAX_DRAWDOWN')
    vi.restoreAllMocks()
  })

  it('losses consecutivos → MAX_LOSSES_CONSECUTIVOS', async () => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/13/2025, 10:00:00 AM')
    mockFindUnique.mockResolvedValue({ entriesCount: 1, drawdownPct: 1, consecutiveLosses: 3 })
    const result = await canTrade('acc1', {
      ...baseRules, allowedDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'],
      startTime: '00:00', endTime: '23:59',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('MAX_LOSSES_CONSECUTIVOS')
    vi.restoreAllMocks()
  })

  it('todas condiciones OK → allowed: true', async () => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/13/2025, 10:00:00 AM')
    mockFindUnique.mockResolvedValue({ entriesCount: 1, drawdownPct: 1, consecutiveLosses: 0 })
    const result = await canTrade('acc1', {
      ...baseRules, allowedDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'],
      startTime: '00:00', endTime: '23:59',
    })
    expect(result.allowed).toBe(true)
    vi.restoreAllMocks()
  })

  it('sin stats del día → allowed: true', async () => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/13/2025, 10:00:00 AM')
    mockFindUnique.mockResolvedValue(null)
    const result = await canTrade('acc1', {
      ...baseRules, allowedDays: ['MON','TUE','WED','THU','FRI','SAT','SUN'],
      startTime: '00:00', endTime: '23:59',
    })
    expect(result.allowed).toBe(true)
    vi.restoreAllMocks()
  })
})
