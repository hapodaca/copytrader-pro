import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import { IcoServer, IcoSignals, IcoCheckCircle, IcoTrendUp } from '../components/icons'

interface Account {
  id: string
  name: string
  environment: 'demo' | 'live'
  balance: number
  brokerType?: string
  hasToken?: boolean
  isActive: boolean
  isPaused?: boolean
  entriesToday?: number
  pnlToday?: number
}

// Paper no necesita conexión de broker — nunca contarla como "sin token"
function isDisconnected(a: Account): boolean {
  return a.brokerType !== 'paper' && !a.hasToken
}

interface Signal {
  id: string
  createdAt: string
  symbol: string
  action: string
  price: number | null
  strategy: string | null
  status: string
  source: string
}

interface DailyStats {
  activeAccounts: number
  signalsToday: number
  ordersExecuted: number
  totalPnl: number
  pausedAccounts: string[]
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  )
}

function kpiTone(value: number): string {
  if (value > 0) return 'text-green-300'
  if (value < 0) return 'text-red-300'
  return 'text-gray-100'
}

function actionBadge(action: string) {
  const map: Record<string, string> = {
    BUY: 'bg-green-900 text-green-300',
    SELL: 'bg-red-900 text-red-300',
    CLOSE_LONG: 'bg-blue-900 text-blue-300',
    CLOSE_SHORT: 'bg-orange-900 text-orange-300',
  }
  return (
    <span className={`inline-block w-24 rounded px-2 py-0.5 text-center text-xs font-mono ${map[action] ?? 'bg-gray-700 text-gray-300'}`}>
      {action.replace('_', ' ')}
    </span>
  )
}

function KpiCard({
  label,
  value,
  sub,
  valueClass,
  accentClass = 'border-t-blue-500',
  icon,
}: {
  label: string
  value: string
  sub: string
  valueClass?: string
  accentClass?: string
  icon?: ReactNode
}) {
  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900 p-4 border-t-2 ${accentClass}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {icon && (
          <span className="mt-0.5 text-gray-600 flex-shrink-0">{icon}</span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClass ?? 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500">{sub}</p>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetchData(showRefresh = false) {
    if (showRefresh) setRefreshing(true)

    try {
      const [accs, sigsRes, dailyStats] = await Promise.all([
        api.get<Account[]>('/api/accounts'),
        api.get<{ signals: Signal[]; total: number }>('/api/signals?limit=8'),
        api.get<DailyStats>('/api/stats/summary'),
      ])

      setAccounts(accs)
      setSignals(sigsRes.signals ?? [])
      setStats(dailyStats)
      setError('')
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData(false)
    const timer = setInterval(() => fetchData(false), 25000)
    return () => clearInterval(timer)
  }, [])

  const pausedAccounts = useMemo(() => accounts.filter((a) => a.isActive && a.isPaused), [accounts])
  const accountsWithoutToken = useMemo(() => accounts.filter((a) => a.isActive && isDisconnected(a)), [accounts])

  const alerts = useMemo(() => {
    const list: Array<{ title: string; body: string; tone: 'yellow' | 'red' }> = []

    if (pausedAccounts.length > 0) {
      list.push({
        tone: 'yellow',
        title: t('dash_alert_paused'),
        body: pausedAccounts.map((a) => a.name).join(', '),
      })
    }

    if (accountsWithoutToken.length > 0) {
      list.push({
        tone: 'red',
        title: t('dash_alert_no_token'),
        body: accountsWithoutToken.map((a) => a.name).join(', '),
      })
    }

    if (accounts.length === 0) {
      list.push({
        tone: 'yellow',
        title: t('dash_alert_no_accs'),
        body: t('dash_alert_no_accs_body'),
      })
    }

    return list
  }, [accounts, accountsWithoutToken, pausedAccounts, t])

  function accountStatusBadge(account: Account) {
    if (!account.isActive) {
      return <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">{t('status_inactive')}</span>
    }
    if (account.isPaused) {
      return <span className="rounded bg-yellow-900 px-2 py-0.5 text-xs text-yellow-300">{t('status_paused')}</span>
    }
    if (account.brokerType === 'paper') {
      return <span className="rounded bg-purple-900 px-2 py-0.5 text-xs text-purple-300">Paper ✓</span>
    }
    if (!account.hasToken) {
      return <span className="rounded bg-orange-900 px-2 py-0.5 text-xs text-orange-300">{t('status_no_token')}</span>
    }
    return <span className="rounded bg-green-900 px-2 py-0.5 text-xs text-green-300">{t('status_active')}</span>
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      {/* Summary header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{t('dash_day_summary')}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {t('dash_updated_at')} {lastUpdated ? lastUpdated.toLocaleTimeString('es-CO') : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/manual')}
            className="rounded-lg border border-blue-600 bg-blue-600/10 px-3 py-1.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-600/20"
          >
            {t('dash_manual_panel')}
          </button>
          <button
            onClick={() => fetchData(true)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
          >
            {refreshing ? `↻ ${t('refreshing')}` : `↻ ${t('refresh')}`}
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="grid gap-3 md:grid-cols-2">
          {alerts.map((alert) => (
            <div
              key={alert.title}
              className={`rounded-xl border p-4 ${
                alert.tone === 'red'
                  ? 'border-red-800 bg-red-900/20 text-red-200'
                  : 'border-yellow-800 bg-yellow-900/20 text-yellow-200'
              }`}
            >
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="mt-1 text-xs opacity-90">{alert.body}</p>
            </div>
          ))}
        </section>
      )}

      {error && <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t('dash_kpi_active_accs')}
          value={String(stats?.activeAccounts ?? 0)}
          sub={t('dash_kpi_active_sub')}
          accentClass="border-t-blue-500"
          icon={<IcoServer className="h-4 w-4" />}
        />
        <KpiCard
          label={t('dash_kpi_signals')}
          value={String(stats?.signalsToday ?? 0)}
          sub={t('dash_kpi_signals_sub')}
          accentClass="border-t-cyan-500"
          icon={<IcoSignals className="h-4 w-4" />}
        />
        <KpiCard
          label={t('dash_kpi_orders')}
          value={String(stats?.ordersExecuted ?? 0)}
          sub={t('dash_kpi_orders_sub')}
          accentClass="border-t-purple-500"
          icon={<IcoCheckCircle className="h-4 w-4" />}
        />
        <KpiCard
          label={t('dash_kpi_pnl')}
          value={`$${(stats?.totalPnl ?? 0).toFixed(2)}`}
          sub={(stats?.totalPnl ?? 0) >= 0 ? t('dash_kpi_pnl_pos') : t('dash_kpi_pnl_neg')}
          valueClass={kpiTone(stats?.totalPnl ?? 0)}
          accentClass={(stats?.totalPnl ?? 0) >= 0 ? 'border-t-green-500' : 'border-t-red-500'}
          icon={<IcoTrendUp className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">{t('dash_accounts_title')}</h3>
            <button onClick={() => navigate('/accounts')}
              className="rounded-md px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors">
              {t('see_all')}
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <p className="text-sm text-gray-500">{t('dash_no_accounts')}</p>
              <button onClick={() => navigate('/accounts')}
                className="mt-1 rounded-lg border border-blue-700 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-900/30">
                {t('create_account')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/70">
              {accounts.slice(0, 8).map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-100">{account.name}</p>
                    <p className="text-xs text-gray-400 font-mono">
                      {account.environment === 'live' ? '🔴 Live' : '🔵 Demo'} · $
                      {account.balance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="flex-shrink-0">{accountStatusBadge(account)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">{t('dash_signals_title')}</h3>
            <button onClick={() => navigate('/signals')}
              className="rounded-md px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors">
              {t('see_history')}
            </button>
          </div>

          {signals.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">{t('dash_no_signals')}</p>
          ) : (
            <div className="divide-y divide-gray-800/70">
              {signals.map((signal) => (
                <div key={signal.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold font-mono text-gray-100">{signal.symbol}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(signal.createdAt).toLocaleString('es-CO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {signal.source}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <span className="hidden w-20 text-right text-xs font-mono tabular-nums text-gray-400 sm:inline">
                      {signal.price ? signal.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                    </span>
                    {actionBadge(signal.action)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
