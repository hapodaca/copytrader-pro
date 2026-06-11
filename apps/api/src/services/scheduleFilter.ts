import { TradingRules, DailyStat } from '@prisma/client'
import { prisma } from '../db/client'

const DAY_MAP: Record<number, string> = {
  0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT',
}

function toChicagoTime(date: Date) {
  const chicagoStr = date.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const chicagoDate = new Date(chicagoStr)
  const dayOfWeek = DAY_MAP[chicagoDate.getDay()]
  const hours = String(chicagoDate.getHours()).padStart(2, '0')
  const minutes = String(chicagoDate.getMinutes()).padStart(2, '0')
  const time = `${hours}:${minutes}`
  const dateStr = chicagoDate.toISOString().split('T')[0]
  return { dayOfWeek, time, date: dateStr, chicagoDate }
}

async function getDailyStats(accountId: string, dateStr: string): Promise<DailyStat | null> {
  const date = new Date(dateStr + 'T00:00:00.000Z')
  return prisma.dailyStat.findUnique({ where: { accountId_date: { accountId, date } } })
}

/**
 * Checks if currentTime (HH:MM string) falls within a session range.
 * Supports cross-midnight windows: if start > end (e.g. "19:00-03:00"),
 * the window wraps around midnight.
 */
function isInSession(currentTime: string, sessionStr: string): boolean {
  const [start, end] = sessionStr.split('-')
  if (!start || !end) return false

  if (start <= end) {
    // Same-day window: e.g. "08:30-15:00"
    return currentTime >= start && currentTime <= end
  } else {
    // Cross-midnight window: e.g. "19:00-03:00"
    // Allowed if time is AFTER start OR BEFORE end
    return currentTime >= start || currentTime <= end
  }
}

export async function canTrade(
  accountId: string,
  rules: TradingRules
): Promise<{ allowed: boolean; reason?: string }> {
  const now = toChicagoTime(new Date())
  const stats = await getDailyStats(accountId, now.date)

  // 1. Día permitido
  if (!rules.allowedDays.includes(now.dayOfWeek)) {
    return { allowed: false, reason: 'DIA_NO_PERMITIDO' }
  }

  // 2. Horario de trading
  // allowedSessions (multi-session, cross-midnight) takes priority over legacy startTime/endTime
  if (rules.allowedSessions && rules.allowedSessions.length > 0) {
    const inAnySesion = rules.allowedSessions.some(s => isInSession(now.time, s))
    if (!inAnySesion) {
      return { allowed: false, reason: 'FUERA_DE_HORARIO' }
    }
  } else {
    // Legacy fallback: single window (same-day only)
    if (now.time < rules.startTime || now.time > rules.endTime) {
      return { allowed: false, reason: 'FUERA_DE_HORARIO' }
    }
  }

  // 2b. Zonas bloqueadas (no-trade zones) — tienen prioridad sobre allowedSessions
  if (rules.blockedSessions && rules.blockedSessions.length > 0) {
    const inBlockedZone = rules.blockedSessions.some(s => isInSession(now.time, s))
    if (inBlockedZone) {
      return { allowed: false, reason: 'HORARIO_BLOQUEADO' }
    }
  }

  if (!stats) return { allowed: true }

  // 3. Límite de entradas del día
  if (stats.entriesCount >= rules.maxEntriesPerDay) {
    return { allowed: false, reason: 'MAX_ENTRADAS_DIA' }
  }

  // 4. Drawdown máximo
  if (stats.drawdownPct >= rules.maxDrawdownPct) {
    return { allowed: false, reason: 'MAX_DRAWDOWN' }
  }

  // 5. Pérdidas consecutivas
  if (rules.pauseAfterMaxLosses && stats.consecutiveLosses >= rules.maxConsecutiveLosses) {
    return { allowed: false, reason: 'MAX_LOSSES_CONSECUTIVOS' }
  }

  return { allowed: true }
}

export async function incrementDailyStat(
  accountId: string,
  field: 'entriesCount' | 'winCount' | 'lossCount'
): Promise<void> {
  const { date } = toChicagoTime(new Date())
  const dateObj = new Date(date + 'T00:00:00.000Z')
  await prisma.dailyStat.upsert({
    where: { accountId_date: { accountId, date: dateObj } },
    update: { [field]: { increment: 1 } },
    create: { accountId, date: dateObj, [field]: 1 },
  })
}
