import { Account, TradingRules } from '@prisma/client'
import { prisma } from '../db/client'
import { BrokerRegistry } from '../integrations/broker/BrokerRegistry'

function toChicagoDateStr(date: Date): string {
  const chicagoStr = date.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  return new Date(chicagoStr).toISOString().split('T')[0]
}

// Recibe la cuenta ya cargada (el caller siempre la tiene) y opcionalmente el
// margen inicial pre-calculado — permite cachearlo por símbolo cuando una señal
// se distribuye a muchas cuentas, evitando una llamada al broker por cuenta.
export async function calculateQty(
  account: Account,
  symbol: string,
  riskPct: number,
  rules: TradingRules,
  precomputedMargin?: number,
): Promise<number> {
  const broker = BrokerRegistry.get(account.brokerType)

  const [balance, margin] = await Promise.all([
    broker.getBalance(account),
    precomputedMargin !== undefined
      ? Promise.resolve(precomputedMargin)
      : broker.getInitialMargin(symbol),
  ])

  if (margin <= 0) return 0

  let riskAmount: number
  if (rules.riskMode === 'fixed_usd') {
    riskAmount = rules.fixedRiskAmount
  } else {
    riskAmount = balance * (riskPct / 100)
  }

  // Reducción por losses consecutivos
  if (rules.reduceRiskAfterLosses) {
    const dateStr = toChicagoDateStr(new Date())
    const date = new Date(dateStr + 'T00:00:00.000Z')
    const stats = await prisma.dailyStat.findUnique({
      where: { accountId_date: { accountId: account.id, date } },
    })
    if (stats && stats.consecutiveLosses > 0) {
      riskAmount *= Math.pow(rules.reduceRiskFactor, stats.consecutiveLosses)
    }
  }

  return Math.max(0, Math.floor(riskAmount / margin))
}
