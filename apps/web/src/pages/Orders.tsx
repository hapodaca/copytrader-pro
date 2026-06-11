import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import { exportToXLSX, exportToPDF } from '../lib/exportTable'

interface Account {
  id: string
  name: string
  brokerType: string
}

interface CopyGroup {
  id: string
  name: string
}

interface Order {
  id: string
  createdAt: string
  accountId: string
  account?: { name: string; brokerType: string }
  groupId: string | null
  group?: { id: string; name: string } | null
  symbol: string
  side: string
  qty: number
  status: string
  tradovateOrderId: string | null
  source: string | null
  timeframe: string | null
  fillPrice: number | null
  exitPrice: number | null
  winLoss: string | null
  closedAt: string | null
  skipReason?: string | null
  errorMsg?: string | null
  signal?: {
    id: string
    source: string | null
    seqNumber: number | null
    timeframe: string | null
    screenshotUrl: string | null
  } | null
}

interface Filters {
  accountId: string
  groupId: string
  source: string
  date: string
}

type SortField = 'createdAt' | 'symbol' | 'side' | 'account' | 'fillPrice' | 'exitPrice' | 'winLoss' | 'status'
type SortDir = 'asc' | 'desc'

interface SortState {
  field: SortField
  dir: SortDir
}

const SOURCE_OPTIONS_VALS = [
  { value: '', labelKey: 'all' },
  { value: 'tradingview', label: 'TradingView' },
  { value: 'manual', label: 'Manual' },
  { value: 'ninjatrader', label: 'NinjaTrader' },
  { value: 'webhook', label: 'Webhook' },
]

const PAGE_SIZE = 25
const REFRESH_MS = 25000

function sourceBadge(src: string | null) {
  const map: Record<string, string> = {
    tradingview: 'bg-blue-900 text-blue-300',
    manual: 'bg-purple-900 text-purple-300',
    ninjatrader: 'bg-yellow-900 text-yellow-300',
    webhook: 'bg-cyan-900 text-cyan-300',
  }
  const label = src ?? '—'
  const cls = src && map[src] ? map[src] : 'bg-gray-700 text-gray-400'
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>
}

function brokerBadge(broker: string | null | undefined) {
  if (!broker) return <span className="text-xs text-gray-600">—</span>
  if (broker === 'paper') return <span className="rounded bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">Paper</span>
  return <span className="rounded bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300">Tradovate</span>
}

function lsBadge(side: string) {
  const isLong = ['BUY', 'LONG', 'buy', 'long'].includes(side)
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-mono font-bold ${isLong ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
      {isLong ? 'L' : 'S'}
    </span>
  )
}

const SKIP_LABELS: Record<string, string> = {
  ORDEN_DUPLICADA:    'DUPLICADA',
  SALDO_INSUFICIENTE: 'SIN SALDO',
  FILTRO_HORARIO:     'HORARIO',
  SIN_REGLAS:         'SIN REGLAS',
  MANUAL_TIMEOUT:     'TIMEOUT',
}

function estadoBadge(order: Order, statusAwaiting: string, statusOpen: string, statusClosed: string) {
  if (order.status === 'awaiting_manual') {
    return <span className="rounded bg-orange-900 px-2 py-0.5 text-xs font-medium text-orange-300">{statusAwaiting}</span>
  }
  if (order.status === 'error') {
    return (
      <span className="rounded bg-red-900 px-2 py-0.5 text-xs font-medium text-red-300" title={order.errorMsg ?? ''}>
        ERROR
      </span>
    )
  }
  if (order.status === 'skipped') {
    const raw = order.skipReason ?? ''
    const label = (SKIP_LABELS[raw] ?? raw) || 'SKIP'
    return (
      <span className="rounded bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-300" title={raw}>
        {label}
      </span>
    )
  }
  const isClosed = !!order.closedAt
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${isClosed ? 'bg-gray-700 text-gray-300' : 'bg-green-900 text-green-300'}`}>
      {isClosed ? statusClosed : statusOpen}
    </span>
  )
}

function wlBadge(wl: string | null) {
  if (!wl) return <span className="text-gray-600">—</span>
  return <span className={`rounded px-2 py-0.5 text-xs font-bold ${wl === 'W' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{wl}</span>
}

export default function Orders() {
  const { t } = useLanguage()
  const [orders, setOrders] = useState<Order[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [groups, setGroups] = useState<CopyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>({ accountId: '', groupId: '', source: '', date: '' })
  const [sort, setSort] = useState<SortState>({ field: 'createdAt', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [ssOrder, setSsOrder] = useState<Order | null>(null)
  const [ssUrl, setSsUrl] = useState('')
  const [ssError, setSsError] = useState('')
  const [ssSaving, setSsSaving] = useState(false)

  async function fetchOrders(p: number, f: Filters, s: SortState, silent = false): Promise<Order[]> {
    if (silent) setRefreshing(true)
    else setLoading(true)

    if (!silent) setError('')

    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE + 1))
      params.set('offset', String((p - 1) * PAGE_SIZE))
      params.set('sortBy', s.field)
      params.set('sortDir', s.dir)
      if (f.accountId) params.set('accountId', f.accountId)
      if (f.groupId) params.set('groupId', f.groupId)
      if (f.source) params.set('source', f.source)
      if (f.date) params.set('date', f.date)

      const res = await api.get<{ orders: Order[] }>(`/api/orders?${params.toString()}`)
      const data = res.orders ?? []
      const pageData = data.slice(0, PAGE_SIZE)

      setHasMore(data.length > PAGE_SIZE)
      setOrders(pageData)
      setLastUpdated(new Date())
      if (!silent) setError('')

      return pageData
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error')
      if (!silent) setError(message)
      return []
    } finally {
      if (silent) setRefreshing(false)
      else {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    api.get<Account[]>('/api/accounts').then(setAccounts).catch(() => {})
    api.get<CopyGroup[]>('/api/groups').then(setGroups).catch(() => {})
  }, [])

  useEffect(() => {
    fetchOrders(page, filters, sort, false)
  }, [page, filters, sort])

  useEffect(() => {
    const timer = setInterval(() => {
      fetchOrders(page, filters, sort, true)
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

  function openSsModal(order: Order) {
    setSsOrder(order)
    setSsUrl(order.signal?.screenshotUrl ?? '')
    setSsError('')
    setSsSaving(false)
  }

  function closeSsModal() {
    setSsOrder(null)
    setSsUrl('')
    setSsError('')
  }

  async function saveScreenshotUrl() {
    if (!ssOrder?.signal?.id) return
    setSsSaving(true); setSsError('')
    try {
      await api.patch(`/api/signals/${ssOrder.signal.id}/screenshot`, { url: ssUrl.trim() })
      setOrders(prev => prev.map(o =>
        o.signal?.id === ssOrder.signal!.id
          ? { ...o, signal: { ...o.signal!, screenshotUrl: ssUrl.trim() || null } }
          : o
      ))
      closeSsModal()
    } catch (e) {
      setSsError(e instanceof Error ? e.message : t('error'))
    } finally {
      setSsSaving(false)
    }
  }

  async function clearScreenshot() {
    if (!ssOrder?.signal?.id) return
    setSsSaving(true); setSsError('')
    try {
      await api.patch(`/api/signals/${ssOrder.signal.id}/screenshot`, { clear: true })
      setOrders(prev => prev.map(o =>
        o.signal?.id === ssOrder.signal!.id
          ? { ...o, signal: { ...o.signal!, screenshotUrl: null } }
          : o
      ))
      closeSsModal()
    } catch (e) {
      setSsError(e instanceof Error ? e.message : t('error'))
    } finally {
      setSsSaving(false)
    }
  }

  async function uploadScreenshotFile(file: File) {
    if (!ssOrder?.signal?.id) return
    setSsSaving(true); setSsError('')
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        const mimeType = file.type
        try {
          const res = await api.patch<{ screenshotUrl: string }>(`/api/signals/${ssOrder.signal!.id}/screenshot`, {
            imageData: dataUrl,
            mimeType,
          })
          const newUrl = res.screenshotUrl
          setOrders(prev => prev.map(o =>
            o.signal?.id === ssOrder.signal!.id
              ? { ...o, signal: { ...o.signal!, screenshotUrl: newUrl } }
              : o
          ))
          closeSsModal()
        } catch (e) {
          setSsError(e instanceof Error ? e.message : t('error'))
        } finally {
          setSsSaving(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (e) {
      setSsError(e instanceof Error ? e.message : t('error'))
      setSsSaving(false)
    }
  }

  async function submitOrder(orderId: string) {
    setSubmitting(orderId)
    try {
      await api.post(`/api/orders/${orderId}/submit`, {})
      const freshOrders = await fetchOrders(page, filters, sort, true)
      if (selectedOrder?.id === orderId) {
        const updated = freshOrders.find((o) => o.id === orderId)
        if (updated) setSelectedOrder(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setSubmitting(null)
    }
  }

  const EXPORT_COLS = [
    { header: t('ord_date'), key: 'createdAt' },
    { header: t('sig_source'), key: 'source' },
    { header: t('ord_group'), key: 'group' },
    { header: 'Envio #', key: 'seqNumber' },
    { header: '# Broker', key: 'tradovateOrderId' },
    { header: t('ord_account'), key: 'account' },
    { header: t('ord_broker'), key: 'broker' },
    { header: t('sig_symbol'), key: 'symbol' },
    { header: 'L/S', key: 'ls' },
    { header: 'TimeFrame', key: 'timeframe' },
    { header: t('ord_entry_price'), key: 'fillPrice' },
    { header: t('ord_exit_price'), key: 'exitPrice' },
    { header: 'W/L', key: 'winLoss' },
    { header: t('status'), key: 'estado' },
    { header: t('close'), key: 'closedAt' },
  ]

  function getExportData() {
    return orders.map((o) => ({
      createdAt: new Date(o.createdAt).toLocaleString('es-MX'),
      source: o.source ?? o.signal?.source ?? '',
      group: o.group?.name ?? o.groupId ?? '',
      seqNumber: o.signal?.seqNumber != null ? `#${o.signal.seqNumber}` : '',
      tradovateOrderId: o.tradovateOrderId ?? '',
      account: o.account?.name ?? o.accountId,
      broker: o.account?.brokerType ?? '',
      symbol: o.symbol,
      ls: ['BUY', 'LONG', 'buy', 'long'].includes(o.side) ? 'L' : 'S',
      timeframe: o.timeframe ?? o.signal?.timeframe ?? '',
      fillPrice: o.fillPrice != null ? o.fillPrice.toFixed(2) : '',
      exitPrice: o.exitPrice != null ? o.exitPrice.toFixed(2) : '',
      winLoss: o.winLoss ?? '',
      estado: o.status === 'awaiting_manual' ? t('status_awaiting') : o.closedAt ? t('status_closed') : t('status_open'),
      closedAt: o.closedAt ? new Date(o.closedAt).toLocaleString('es-MX') : '',
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{t('ord_title')}</h1>
          <p className="mt-0.5 text-xs text-gray-500">{t('dash_updated_at')} {lastUpdated ? lastUpdated.toLocaleTimeString('es-CO') : '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fetchOrders(page, filters, sort, false)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:border-gray-500"
          >
            {refreshing ? t('refreshing') : t('refresh')}
          </button>
          <button
            onClick={() => exportToXLSX('bitacora', EXPORT_COLS, getExportData())}
            disabled={orders.length === 0}
            className="rounded-lg bg-green-800 px-3 py-1.5 text-xs font-medium text-green-100 transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↓ XLSX
          </button>
          <button
            onClick={() => exportToPDF('bitacora', t('ord_title'), EXPORT_COLS, getExportData())}
            disabled={orders.length === 0}
            className="rounded-lg bg-red-900 px-3 py-1.5 text-xs font-medium text-red-100 transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↓ PDF
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('ord_account')}</label>
            <select
              value={filters.accountId}
              onChange={(e) => handleFilterChange('accountId', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">{t('all_f')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('ord_group')}</label>
            <select
              value={filters.groupId}
              onChange={(e) => handleFilterChange('groupId', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">{t('all')}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
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
              {SOURCE_OPTIONS_VALS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.labelKey ? t(o.labelKey as Parameters<typeof t>[0]) : o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">{t('sig_date')}</label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => handleFilterChange('date', e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-800 bg-red-900/30 p-4 text-sm text-red-300">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        {loading ? (
          <div className="py-10 text-center">
            <div className="flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-10 text-center text-gray-500">{t('ord_no_orders')}</div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {orders.map((order) => {
                const tf = order.timeframe ?? order.signal?.timeframe ?? '—'
                const src = order.source ?? order.signal?.source ?? null
                const chart = order.signal?.screenshotUrl ?? null
                return (
                  <article
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="cursor-pointer rounded-lg border border-gray-800 bg-gray-950/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-mono text-gray-400">
                          {new Date(order.createdAt).toLocaleString('es-MX', {
                            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                        <p className="mt-1 font-mono text-sm font-semibold text-gray-100">{order.symbol}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {estadoBadge(order, t('status_awaiting'), t('status_open'), t('status_closed'))}
                        {lsBadge(order.side)}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      {sourceBadge(src)}
                      <span>TF {tf}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gray-500">{t('ord_entry_p')}</p>
                        <p className="font-mono text-gray-200">{order.fillPrice != null ? order.fillPrice.toFixed(2) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">{t('ord_exit_p')}</p>
                        <p className="font-mono text-gray-200">{order.exitPrice != null ? order.exitPrice.toFixed(2) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">W/L</p>
                        <div className="mt-0.5">{wlBadge(order.winLoss)}</div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      <p className="truncate">{t('ord_account')}: <span className="text-gray-200">{order.account?.name ?? order.accountId}</span></p>
                      <p className="truncate">{t('ord_group')}: <span className="text-gray-300">{order.group?.name ?? t('ord_no_group')}</span></p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {order.status === 'awaiting_manual' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); submitOrder(order.id) }}
                          disabled={submitting === order.id}
                          className="rounded bg-blue-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                        >
                          {submitting === order.id ? '...' : t('ord_send')}
                        </button>
                      )}
                      {order.signal && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openSsModal(order) }}
                          className={`rounded px-2 py-1 text-xs transition-colors ${chart ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                          📷 {chart ? t('ord_view_image') : t('ord_add_image')}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="px-3 py-3 text-left font-medium">
                      <button onClick={() => handleSort('createdAt')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        {t('ord_date')} <span className="text-[10px]">{sortIndicator('createdAt')}</span>
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left font-medium">
                      <button onClick={() => handleSort('symbol')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        {t('sig_symbol')} <span className="text-[10px]">{sortIndicator('symbol')}</span>
                      </button>
                    </th>
                    <th className="px-3 py-3 text-center font-medium">
                      <button onClick={() => handleSort('side')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        L/S <span className="text-[10px]">{sortIndicator('side')}</span>
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left font-medium">
                      <button onClick={() => handleSort('account')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        {t('ord_account')} <span className="text-[10px]">{sortIndicator('account')}</span>
                      </button>
                    </th>
                    <th className="hidden px-3 py-3 text-right font-medium md:table-cell">
                      <button onClick={() => handleSort('fillPrice')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        {t('ord_entry_price')} <span className="text-[10px]">{sortIndicator('fillPrice')}</span>
                      </button>
                    </th>
                    <th className="hidden px-3 py-3 text-right font-medium lg:table-cell">
                      <button onClick={() => handleSort('exitPrice')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        {t('ord_exit_price')} <span className="text-[10px]">{sortIndicator('exitPrice')}</span>
                      </button>
                    </th>
                    <th className="px-3 py-3 text-center font-medium">
                      <button onClick={() => handleSort('winLoss')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        W/L <span className="text-[10px]">{sortIndicator('winLoss')}</span>
                      </button>
                    </th>
                    <th className="px-3 py-3 text-center font-medium">
                      <button onClick={() => handleSort('status')} className="inline-flex items-center gap-1 hover:text-gray-200">
                        {t('status')} <span className="text-[10px]">{sortIndicator('status')}</span>
                      </button>
                    </th>
                    <th className="px-3 py-3 text-center font-medium">Img</th>
                    <th className="px-3 py-3 text-center font-medium">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const tf = order.timeframe ?? order.signal?.timeframe ?? '—'
                    const src = order.source ?? order.signal?.source ?? null
                    const chart = order.signal?.screenshotUrl ?? null
                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="cursor-pointer border-b border-gray-800/50 transition-colors hover:bg-gray-800/30"
                      >
                        <td className="px-3 py-3">
                          <p className="whitespace-nowrap text-xs font-mono text-gray-300">
                            {new Date(order.createdAt).toLocaleString('es-MX', {
                              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">{sourceBadge(src)}</div>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-mono text-sm font-semibold text-gray-100">{order.symbol}</p>
                          <p className="text-xs text-gray-500">TF {tf}</p>
                        </td>

                        <td className="px-3 py-3 text-center">{lsBadge(order.side)}</td>

                        <td className="px-3 py-3">
                          <p className="max-w-[120px] truncate text-xs text-gray-100">{order.account?.name ?? order.accountId}</p>
                          <p className="max-w-[120px] truncate text-xs text-gray-500">{order.group?.name ?? t('ord_no_group')}</p>
                        </td>

                        <td className="hidden px-3 py-3 text-right font-mono text-xs text-gray-300 md:table-cell">
                          {order.fillPrice != null ? order.fillPrice.toFixed(2) : '—'}
                        </td>

                        <td className="hidden px-3 py-3 text-right font-mono text-xs text-gray-300 lg:table-cell">
                          {order.exitPrice != null ? order.exitPrice.toFixed(2) : '—'}
                        </td>

                        <td className="px-3 py-3 text-center">{wlBadge(order.winLoss)}</td>
                        <td className="px-3 py-3 text-center">{estadoBadge(order, t('status_awaiting'), t('status_open'), t('status_closed'))}</td>

                        <td className="px-3 py-3 text-center">
                          {order.signal ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openSsModal(order) }}
                              title={chart ? t('ord_view_edit_image') : t('ord_add_image')}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                                chart ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                              }`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                            </button>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {order.status === 'awaiting_manual' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); submitOrder(order.id) }}
                                disabled={submitting === order.id}
                                className="whitespace-nowrap rounded bg-blue-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                              >
                                {submitting === order.id ? '...' : t('ord_send')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {!loading && (orders.length > 0 || page > 1) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('previous')}
          </button>
          <span className="text-center text-sm text-gray-400">{t('page')} {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('next')}
          </button>
        </div>
      )}

      {/* ── Screenshot Modal ─────────────────────────────────────────────────── */}
      {ssOrder && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={closeSsModal}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">{t('ord_screenshot')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {ssOrder.symbol} · {ssOrder.side} · {ssOrder.account?.name}
                </p>
              </div>
              <button onClick={closeSsModal} className="text-gray-400 hover:text-gray-100 text-xl leading-none">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {ssOrder.signal?.screenshotUrl ? (
                <div className="space-y-2">
                  <img
                    src={ssOrder.signal.screenshotUrl}
                    alt="Trade screenshot"
                    className="w-full rounded-lg border border-gray-800 max-h-56 object-contain bg-gray-950"
                    onError={e => { (e.target as HTMLImageElement).alt = 'No se pudo cargar la imagen' }}
                  />
                  <div className="flex items-center justify-between">
                    <a href={ssOrder.signal.screenshotUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300">
                      {t('ord_open_tab')}
                    </a>
                    <button onClick={clearScreenshot} disabled={ssSaving}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                      {ssSaving ? t('ord_removing') : t('ord_remove_image')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-800 bg-gray-950 py-8 text-center text-sm text-gray-500">
                  {t('ord_no_image')}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">{t('ord_paste_url')}</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={ssUrl}
                    onChange={e => setSsUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={saveScreenshotUrl}
                    disabled={ssSaving || !ssUrl.trim()}
                    className="whitespace-nowrap rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {ssSaving ? '...' : t('ord_save_url')}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">{t('ord_upload_file')}</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  disabled={ssSaving}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadScreenshotFile(file)
                    e.target.value = ''
                  }}
                  className="w-full cursor-pointer rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-gray-700 file:px-2 file:py-1 file:text-xs file:text-gray-200 disabled:opacity-50"
                />
              </div>

              {ssError && (
                <p className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-300">{ssError}</p>
              )}

              <p className="text-[10px] text-gray-600">{t('ord_image_note')}</p>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/60" onClick={() => setSelectedOrder(null)} aria-label="Cerrar detalle" />

          <aside className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-gray-800 bg-gray-900 p-5 md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-full md:max-w-xl md:rounded-none md:border-l md:border-t-0">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-800 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">
                  {selectedOrder.symbol} · {selectedOrder.side}
                </h2>
                <p className="mt-1 text-xs text-gray-500">{new Date(selectedOrder.createdAt).toLocaleString('es-CO')}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-2xl leading-none text-gray-400 hover:text-white">
                &times;
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-950/60 p-4">
                <div>
                  <p className="text-xs text-gray-500">{t('status')}</p>
                  <div className="mt-1">{estadoBadge(selectedOrder, t('status_awaiting'), t('status_open'), t('status_closed'))}</div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('ord_broker')}</p>
                  <div className="mt-1">{brokerBadge(selectedOrder.account?.brokerType)}</div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('ord_quantity')}</p>
                  <p className="mt-1 font-mono text-gray-200">{selectedOrder.qty}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">W/L</p>
                  <div className="mt-1">{wlBadge(selectedOrder.winLoss)}</div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('ord_entry_p')}</p>
                  <p className="mt-1 font-mono text-gray-200">{selectedOrder.fillPrice != null ? selectedOrder.fillPrice.toFixed(2) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('ord_exit_p')}</p>
                  <p className="mt-1 font-mono text-gray-200">{selectedOrder.exitPrice != null ? selectedOrder.exitPrice.toFixed(2) : '—'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('ord_traceability')}</p>
                <div className="space-y-2 text-xs">
                  <p className="text-gray-400">
                    Order ID: <span className="font-mono text-gray-200">{selectedOrder.id}</span>
                  </p>
                  <p className="text-gray-400">
                    Signal ID: <span className="font-mono text-gray-200">{selectedOrder.signal?.id ?? '—'}</span>
                  </p>
                  <p className="text-gray-400">
                    # Broker: <span className="font-mono text-cyan-300">{selectedOrder.tradovateOrderId ?? '—'}</span>
                  </p>
                  <p className="text-gray-400">
                    {t('ord_sequence')}{' '}
                    <span className="font-mono text-gray-200">
                      {selectedOrder.signal?.seqNumber != null ? `#${selectedOrder.signal.seqNumber}` : '—'}
                    </span>
                  </p>
                </div>
              </div>

              {(selectedOrder.skipReason || selectedOrder.errorMsg) && (
                <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-xs text-red-300">
                  {selectedOrder.skipReason && <p>Skip reason: {selectedOrder.skipReason}</p>}
                  {selectedOrder.errorMsg && <p className="mt-1">Error: {selectedOrder.errorMsg}</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {selectedOrder.status === 'awaiting_manual' && (
                  <button
                    onClick={() => submitOrder(selectedOrder.id)}
                    disabled={submitting === selectedOrder.id}
                    className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                  >
                    {submitting === selectedOrder.id ? t('sending') : t('ord_send_order')}
                  </button>
                )}

                {selectedOrder.signal && (
                  <button
                    onClick={() => openSsModal(selectedOrder)}
                    className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-gray-500 flex items-center gap-1.5"
                  >
                    📷 {selectedOrder.signal.screenshotUrl ? t('ord_view_edit_image') : t('ord_add_image')}
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
