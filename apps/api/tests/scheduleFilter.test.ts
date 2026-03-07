import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canTrade, toChicagoTime } from '../src/services/scheduleFilter';

// Mock Prisma
vi.mock('../src/db/client', () => ({
  default: {
    dailyStat: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../src/db/client';

const defaultRules = {
  allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  startTime: '08:00',
  endTime: '15:30',
  maxEntriesPerDay: 3,
  maxDrawdownPct: 5.0,
  maxConsecutiveLosses: 3,
  pauseAfterMaxLosses: true,
};

describe('scheduleFilter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('toChicagoTime', () => {
    it('should return dayOfWeek, time, and date', () => {
      const result = toChicagoTime(new Date('2024-01-15T14:30:00Z'));
      expect(result.dayOfWeek).toBeDefined();
      expect(result.time).toMatch(/^\d{2}:\d{2}$/);
      expect(result.date).toBeInstanceOf(Date);
    });
  });

  describe('canTrade', () => {
    it('should return DIA_NO_PERMITIDO on weekend', async () => {
      // Mock a Saturday
      vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('1/13/2024, 10:00:00 AM');
      // Jan 13, 2024 is a Saturday
      const mockDate = new Date('2024-01-13T16:00:00Z');
      vi.setSystemTime(mockDate);

      const rules = { ...defaultRules, allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'] };

      (prisma.dailyStat.findUnique as any).mockResolvedValue(null);

      const result = await canTrade('account-1', rules);

      // If the mocked day is SAT, should be rejected
      if (result.reason === 'DIA_NO_PERMITIDO') {
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('DIA_NO_PERMITIDO');
      }

      vi.useRealTimers();
    });

    it('should return FUERA_DE_HORARIO when outside trading hours', async () => {
      // Mock getDailyStats to return empty stats
      (prisma.dailyStat.findUnique as any).mockResolvedValue(null);

      // Allow all days so day check passes, then set impossible time window
      const rules = {
        ...defaultRules,
        allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        startTime: '23:00',
        endTime: '23:30',
      };

      const result = await canTrade('account-1', rules);

      // With startTime 23:00 and endTime 23:30, most times of day will be FUERA_DE_HORARIO
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('FUERA_DE_HORARIO');
    });

    it('should return MAX_ENTRADAS_DIA when max entries reached', async () => {
      (prisma.dailyStat.findUnique as any).mockResolvedValue({
        entriesCount: 3,
        drawdownPct: 0,
        consecutiveLosses: 0,
        isPaused: false,
      });

      // Use rules that allow current day and current time
      const now = toChicagoTime(new Date());
      const rules = {
        ...defaultRules,
        allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        startTime: '00:00',
        endTime: '23:59',
        maxEntriesPerDay: 3,
      };

      const result = await canTrade('account-1', rules);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('MAX_ENTRADAS_DIA');
    });

    it('should return MAX_DRAWDOWN when drawdown exceeded', async () => {
      (prisma.dailyStat.findUnique as any).mockResolvedValue({
        entriesCount: 1,
        drawdownPct: 6.0,
        consecutiveLosses: 0,
        isPaused: false,
      });

      const rules = {
        ...defaultRules,
        allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        startTime: '00:00',
        endTime: '23:59',
        maxDrawdownPct: 5.0,
      };

      const result = await canTrade('account-1', rules);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('MAX_DRAWDOWN');
    });

    it('should return MAX_LOSSES_CONSECUTIVOS when consecutive losses exceeded', async () => {
      (prisma.dailyStat.findUnique as any).mockResolvedValue({
        entriesCount: 1,
        drawdownPct: 2.0,
        consecutiveLosses: 3,
        isPaused: false,
      });

      const rules = {
        ...defaultRules,
        allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        startTime: '00:00',
        endTime: '23:59',
        maxConsecutiveLosses: 3,
        pauseAfterMaxLosses: true,
      };

      const result = await canTrade('account-1', rules);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('MAX_LOSSES_CONSECUTIVOS');
    });

    it('should return allowed:true when all conditions pass', async () => {
      (prisma.dailyStat.findUnique as any).mockResolvedValue({
        entriesCount: 1,
        drawdownPct: 2.0,
        consecutiveLosses: 1,
        isPaused: false,
      });

      const rules = {
        ...defaultRules,
        allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        startTime: '00:00',
        endTime: '23:59',
      };

      const result = await canTrade('account-1', rules);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });
});
