import prisma from '../db/client';

interface TradingRulesInput {
  allowedDays: string[];
  startTime: string;
  endTime: string;
  maxEntriesPerDay: number;
  maxDrawdownPct: number;
  maxConsecutiveLosses: number;
  pauseAfterMaxLosses: boolean;
}

interface CanTradeResult {
  allowed: boolean;
  reason?: string;
}

export function toChicagoTime(date: Date) {
  const chicagoStr = date.toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const chicagoDate = new Date(chicagoStr);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
  const dayOfWeek = days[chicagoDate.getDay()];
  const hours = chicagoDate.getHours().toString().padStart(2, '0');
  const minutes = chicagoDate.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;
  const dateOnly = new Date(chicagoDate.getFullYear(), chicagoDate.getMonth(), chicagoDate.getDate());
  return { dayOfWeek, time, date: dateOnly };
}

export async function getDailyStats(accountId: string, date: Date) {
  const stat = await prisma.dailyStat.findUnique({
    where: { accountId_date: { accountId, date } },
  });
  return stat || {
    entriesCount: 0,
    pnl: 0,
    drawdownPct: 0,
    consecutiveLosses: 0,
    isPaused: false,
  };
}

export async function canTrade(accountId: string, rules: TradingRulesInput): Promise<CanTradeResult> {
  const now = toChicagoTime(new Date());
  const stats = await getDailyStats(accountId, now.date);

  // 1. Día permitido
  if (!rules.allowedDays.includes(now.dayOfWeek)) {
    return { allowed: false, reason: 'DIA_NO_PERMITIDO' };
  }

  // 2. Horario
  if (now.time < rules.startTime || now.time > rules.endTime) {
    return { allowed: false, reason: 'FUERA_DE_HORARIO' };
  }

  // 3. Límite entradas del día
  if (stats.entriesCount >= rules.maxEntriesPerDay) {
    return { allowed: false, reason: 'MAX_ENTRADAS_DIA' };
  }

  // 4. Drawdown máximo
  if (stats.drawdownPct >= rules.maxDrawdownPct) {
    return { allowed: false, reason: 'MAX_DRAWDOWN' };
  }

  // 5. Pérdidas consecutivas
  if (rules.pauseAfterMaxLosses && stats.consecutiveLosses >= rules.maxConsecutiveLosses) {
    return { allowed: false, reason: 'MAX_LOSSES_CONSECUTIVOS' };
  }

  return { allowed: true };
}
