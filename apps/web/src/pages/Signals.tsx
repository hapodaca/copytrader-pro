import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import { exportToXLSX, exportToPDF } from '../lib/exportTable'

interface Order {
  id: string
  accountId: string
  account?: { name: string }
  side: string
  qty: number
  status: string
  fillPrice: number | null
  skipReason: string | null
  errorMsg: string | null
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
  orders?: Order[]
}

interface Filters {
  status: string
  source: string
  symbol: string
  dateFrom: string
  dateTo: string
}

type SortField = 'createdAt' | 'symbol' | 'action' | 'price' | 'strategy' | 'status' | 'source'
type SortDir = 'asc' | 'desc'

interface SortState {
  field: SortField
  dir: SortDir
}

const STATUS_OPTIONS = ['', 'received', 'processed', 'rejected', 'pending', 'processing', 'completed', 'failed', 'skipped']
const SOURCE_OPTIONS_VALS = [
  { value: '', labelKey: 'all' },
  { value: 'tradingview', label: 'TradingView' },
  { value: 'manual', label: 'Manual' },
  { value: 'ninjatrader', label: 'NinjaTrader' },
  { value: 'webhook', label: 'Webhook' },
]

const PAGE_SIZE = 20
const REFRESH_MS = 20000

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  )
}

function actionBadge(action: string) {
  const map: Record<string, string> = {
    BUY: 'bg-green-900 text-green-300',
    SELL: 'bg-red-900 text-red-300',
    CLOSE_LONG: 'bg-blue-900 text-blue-300',
    CLOSE_SHORT: 'bg-orange-900 text-orange-300',
  }
  return <span className={`rounded px-2 py-0.5 text-xs font-mono ${map[action] ?? 'bg-gray-700 text-gray-300'}`}>{action}</span>
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    received: 'bg-yellow-900 text-yellow-300',
    processed: 'bg-green-900 text-green-300',
    rejected: 'bg-red-900 text-red-300',
    pending: 'bg-yellow-900 text-yellow-300',
    processing: 'bg-blue-900 text-blue-300',
    completed: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
    skipped: 'bg-gray-700 text-gray-400',
  }
  return <span className={`rounded px-2 py-0.5 text-xs capitalize ${map[status] ?? 'bg-gray-700 text-gray-300'}`}>{status}</span>
}

function sourceBadge(source: string) {
  const map: Record<string, string> = {
    tradingview: 'bg-blue-900 text-blue-300',
    manual: 'bg-purple-900 text-purple-300',
    ninjatrader: 'bg-yellow-900 text-yellow-300',
    webhook: 'bg-cyan-900 text-cyan-300',
  }
  const label: Record<string, string> = {
    tradingview: 'TradingView',
    manual: 'Manual',
    ninjatrader: 'NinjaTrader',
    webhook: 'Webhook',
  }
  return <span className={`rounded px-2 py-0.5 text-xs ${map[source] ?? 'bg-gray-700 text-gray-400'}`}>{label[source] ?? source}</span>
}

function orderStatusBadge(status: string) {
  const map: Record<string, string> = {
    filled: 'bg-green-900 text-green-300',
    sent: 'bg-blue-900 text-blue-300',
    pending: 'bg-yellow-900 text-yellow-300',
    skipped: 'bg-gray-700 text-gray-400',
    error: 'bg-red-900 text-red-300',
  }
  return <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${map[status] ?? 'bg-gray-700 text-gray-300'}`}>{status}</span>
}

export default function Signals() {
  const { t } = useLanguage()
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>({ status: '', source: '', symbol: '', dateFrom: '', dateTo: '' })
  const [sort, setSort] = useState<SortState>({ field: 'createdAt', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [drawerSignal, setDrawerSignal] = useState<Signal | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function fetchSignals(p: number, f: Filters, s: SortState, silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)

    if (!silent) setError('')

    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE + 1))
      params.set('offset', String((p - 1) * PAGE_SIZE))
      params.set('sortBy', s.field)
      params.set('sortDir', s.dir)
      if (f.status) params.set('status', f.status)
      if (f.source) params.set('source', f.source)
      if (f.symbol) params.set('symbol', f.symbol.toUpperCase())
      if (f.dateFrom) params.set('dateFrom', f.dateFrom)
      if (f.dateTo) params.set('dateTo', f.dateTo)

      const res = await api.get<{ signals: Signal[]; total: number }>(`/api/signals?${params.toString()}`)
      const data = res.signals ?? []

      setHasMore(data.length > PAGE_SIZE)
      setSignals(data.slice(0, PAGE_SIZE))
      setLastUpdated(new Date())
      if (!silent) setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error')
      if (!silent) setError(message)
    } finally {
      if (silent) setRefreshing(false)
      else {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    fetchSignals(page, filters, sort, false)
  }, [page, filters, sort])

  useEffect(() => {
    const timer = setInterval(() => {
      fetchSignals(page, filters, sort, true)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [page, filters, sort])

  function handleFilterChange(key: keyof Filters, value: string) {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  function handleSort(field: SortField) {
    setPage(1)
    setSort((current) => {
      if (current.field === field) {
        return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { field, dir: field === 'createdAt' ? 'desc' : 'asc' }
    })
  }

  function sortIndicator(field: SortField) {
    if (sort.field !== field) return '↕'
    return sort.dir === 'asc' ? '↑' : '↓'
  }

  const EXPORT_COLS = [
    { header: t('sig_date'), key: 'createdAt' },
    { header: t('sig_symbol'), key: 'symbol' },
    { header: t('sig_action'), key: 'action' },
    { header: t('sig_price'), key: 'price' },
    { header: t('sig_strategy'), key: 'strategy' },
    { header: t('sig_status'), key: 'status' },
    { header: t('sig_source'), key: 'source' },
  ]

  function getExportData() {
    return signals.map((s) => ({
      createdAt: new Date(s.createdAt).toLocaleString('es-MX'),
      symbol: s.symbol,
      action: s.action,
      price: s.price ? s.price.toFixed(2) : '',
      strategy: s.strategy ?? '',
      status: s.status,
      source: s.source,
    }))
  }

  async function openDrawer(signal: Signal) {
    setDrawerSignal(signal)

    if (!signal.orders) {
      setLoadingDetail(true)
      try {
        const detail = await api.get<Signal>(`/api/signals/${signal.id}`)
        setDrawerSignal(detail)
      } catch {
        // no-op
      } finally {
        setLoadingDetail(false)
      }
    }
  }

  if (loading && signals.length === 0) {
    return <Spinner />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{t('sig_title')}</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {t('dash_updated_at')} {lastUpdated ? lastUpdated.toLocaleTimeString('es-CO') : '—'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fetchSignals(page, filters, sort, false)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:border-gray-500"
          >
            {refreshing ? t('refreshing') : t('refresh')}
          </button>
          <button
            onClick={() => exportToXLSX('señales', EXPORT_COLS, getExportData())}
            disabled={signals.length === 0}
            className="rounded-lg bg-green-800 px-3 py-1.5 text-xs font-medium text-green-100 transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↓ XLSX
          </button>
          <button
            onClick={() => exportToPDF('señales', t('sig_title'), EXPORT_COLS, getExportData())}
            disabled={signals.length === 0}
            className="rounded-lg bg-red-900 px-3 py-1.5 text-xs font-medium text-red-100 transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↓ PDF
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('sig_symbol')}</label>
            <input
              type="text"
              value={filters.symbol}
              onChange={(e) => handleFilterChange('symbol', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-mono uppercase text-gray-100 focus:border-blue-500 focus:outline-none"
              placeholder="MNQU25"
              maxLength={10}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('sig_from')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('sig_to')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('sig_status')}</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status || t('all')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('sig_source')}</label>
            <select
              value={filters.source}
              onChange={(e) => handleFilterChange('source', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {SOURCE_OPTIONS_VALS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.labelKey ? t(option.labelKey as Parameters<typeof t>[0]) : option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-800 bg-red-900/30 p-4 text-sm text-red-300">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3 text-left font-medium">
                  <button onClick={() => handleSort('createdAt')} className="inline-flex items-center gap-1 hover:text-gray-200">
                    {t('sig_date')} <span className="text-[10px]">{sortIndicator('createdAt')}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button onClick={() => handleSort('symbol')} className="inline-flex items-center gap-1 hover:text-gray-200">
                    {t('sig_symbol')} <span className="text-[10px]">{sortIndicator('symbol')}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button onClick={() => handleSort('action')} className="inline-flex items-center gap-1 hover:text-gray-200">
                    {t('sig_action')} <span className="text-[10px]">{sortIndicator('action')}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <button onClick={() => handleSort('price')} className="inline-flex items-center gap-1 hover:text-gray-200">
                    {t('sig_price')} <span className="text-[10px]">{sortIndicator('price')}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button onClick={() => handleSort('strategy')} className="inline-flex items-center gap-1 hover:text-gray-200">
                    {t('sig_strategy')} <span className="text-[10px]">{sortIndicator('strategy')}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button onClick={() => handleSort('status')} className="inline-flex items-center gap-1 hover:text-gray-200">
                    {t('sig_status')} <span className="text-[10px]">{sortIndicator('status')}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button onClick={() => handleSort('source')} className="inline-flex items-center gap-1 hover:text-gray-200">
                    {t('sig_source')} <span className="text-[10px]">{sortIndicator('source')}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                    </div>
                  </td>
                </tr>
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-500">
                    {t('sig_no_signals')}
                  </td>
                </tr>
              ) : (
                signals.map((signal) => (
                  <tr
                    key={signal.id}
                    onClick={() => openDrawer(signal)}
                    className="cursor-pointer border-b border-gray-800/50 transition-colors hover:bg-gray-800/40"
                  >
                    <td className="px-4 py-3 text-xs font-mono text-gray-400">
                      {new Date(signal.createdAt).toLocaleString('es-MX', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-100">{signal.symbol}</td>
                    <td className="px-4 py-3">{actionBadge(signal.action)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {signal.price ? signal.price.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{signal.strategy ?? '—'}</td>
                    <td className="px-4 py-3">{statusBadge(signal.status)}</td>
                    <td className="px-4 py-3">{sourceBadge(signal.source)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && (signals.length > 0 || page > 1) && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('previous')}
          </button>
          <span className="text-sm text-gray-400">{t('page')} {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('next')}
          </button>
        </div>
      )}

      {drawerSignal && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setDrawerSignal(null)} />
          <div className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-gray-800 bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-800 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">
                  {drawerSignal.symbol} — {drawerSignal.action}
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">{new Date(drawerSignal.createdAt).toLocaleString('es-MX')}</p>
              </div>
              <button onClick={() => setDrawerSignal(null)} className="text-2xl leading-none text-gray-400 hover:text-gray-100">
                &times;
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <div className="space-y-2 rounded-lg bg-gray-800 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">ID:</span>
                  <span className="font-mono text-xs text-gray-300">{drawerSignal.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('sig_status')}:</span>
                  <span>{statusBadge(drawerSignal.status)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('sig_price')}:</span>
                  <span className="font-mono text-gray-300">{drawerSignal.price ? drawerSignal.price.toFixed(2) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('sig_strategy')}:</span>
                  <span className="text-gray-300">{drawerSignal.strategy ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('sig_source')}:</span>
                  <span>{sourceBadge(drawerSignal.source)}</span>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-gray-300">{t('sig_orders_gen')}</h3>
                {loadingDetail ? (
                  <div className="flex justify-center py-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                  </div>
                ) : !drawerSignal.orders || drawerSignal.orders.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">{t('sig_no_orders')}</p>
                ) : (
                  <div className="space-y-2">
                    {drawerSignal.orders.map((order) => (
                      <div key={order.id} className="space-y-1.5 rounded-lg bg-gray-800 p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-200">{order.account?.name ?? order.accountId}</span>
                          {orderStatusBadge(order.status)}
                        </div>
                        <div className="flex gap-4 text-gray-400">
                          <span>
                            Side: <span className="text-gray-200">{order.side}</span>
                          </span>
                          <span>
                            Qty: <span className="text-gray-200">{order.qty}</span>
                          </span>
                          {order.fillPrice != null && (
                            <span>
                              Fill: <span className="font-mono text-gray-200">{order.fillPrice.toFixed(2)}</span>
                            </span>
                          )}
                        </div>
                        {order.skipReason && <p className="text-yellow-400">Skip: {order.skipReason}</p>}
                        {order.errorMsg && <p className="text-red-400">Error: {order.errorMsg}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
