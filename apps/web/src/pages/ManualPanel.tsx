import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { supabase } from '../lib/supabase'
import TradingViewWidget from '../components/TradingViewWidget'
import { useLanguage } from '../contexts/LanguageContext'

interface CopyGroup {
  id: string
  name: string
  followers?: { id: string }[]
  _count?: { followers: number }
}

const TIMEFRAMES    = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', 'Daily', 'Weekly']
const DEFAULT_TF    = '1h'
const DEFAULT_TTL   = 60   // fallback if admin hasn't configured anything
const REFRESH_MS    = 20_000

interface ManualSignalPayload {
  groupId: string
  symbol: string
  action: 'BUY' | 'SELL' | 'CLOSE_LONG' | 'CLOSE_SHORT'
  timeframe?: string
  sl?: number
  tp?: number
}

// awaiting_manual order from SSE (TradingView webhook)
interface AwaitingOrder {
  id: string
  signalId: string
  accountId: string
  symbol: string
  side: string
  qty: number
  sl: number | null
  tp: number | null
  createdAt: string
  source: string | null
  timeframe: string | null
  account: { id: string; name: string }
  group:   { id: string; name: string } | null
  signal:  { id: string; screenshotUrl: string | null } | null
}

// Generic order from REST API (any status)
interface ApiOrder {
  id: string
  signalId: string
  symbol: string
  side: string
  qty: number
  sl: number | null
  tp: number | null
  status: string
  skipReason: string | null
  errorMsg: string | null
  fillPrice: number | null
  exitPrice: number | null
  closedAt: string | null
  createdAt: string
  source: string | null
  timeframe: string | null
  account: { id: string; name: string }
  group:   { id: string; name: string } | null
  signal:  { id: string; screenshotUrl: string | null } | null
}

interface SessionEntry {
  id: string
  timestamp: Date
  groupId: string
  group: string
  symbol: string
  action: string
  signalId: string
  result: 'ok' | 'error' | 'awaiting'
  message: string
  closed: boolean
  closeSending: boolean
  orderId?: string
  screenshotUrl?: string
  isManualPending?: boolean
  sl?: number
  tp?: number
  qty?: number
  dbStatus?: string
  skipReason?: string
  errorMsg?: string
  fillPrice?: number
  isSummary?: boolean
  orderCount?: number
}

const SYMBOL_REGEX = /^[A-Z]{2,6}\d{2}$/

// ── Tickers rápidos ───────────────────────────────────────────────────────────
// Un click rellena el símbolo con el contrato trimestral vigente (ej: MNQ → MNQM26).
// Muestra los últimos usados primero; los default rellenan hasta 8.
const QUICK_TICKERS = ['MNQ', 'MES', 'M2K', 'MYM', 'NQ', 'ES', 'MGC', 'MCL']
const RECENT_TICKERS_KEY = 'stp_recent_tickers'

function loadRecentTickers(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_TICKERS_KEY) ?? '[]')
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []
  } catch { return [] }
}

function tickerRoot(contract: string): string {
  // 'MNQM26' → 'MNQ' (quita letra de mes trimestral + 2 dígitos de año)
  return contract.replace(/[FGHJKMNQUVXZ]\d{2}$/, '')
}

function thirdFriday(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1).getDay()
  const offset = (5 - firstDay + 7) % 7
  return new Date(year, month, 1 + offset + 14)
}

// Código de mes+año del contrato trimestral al frente (H/M/U/Z).
// Rollover ~8 días antes del 3er viernes del mes de vencimiento.
function frontQuarterCode(now = new Date()): string {
  const quarters: Array<[number, string]> = [[2, 'H'], [5, 'M'], [8, 'U'], [11, 'Z']]
  for (const [month, code] of quarters) {
    const roll = thirdFriday(now.getFullYear(), month)
    roll.setDate(roll.getDate() - 8)
    if (now < roll) return `${code}${String(now.getFullYear() % 100).padStart(2, '0')}`
  }
  return `H${String((now.getFullYear() + 1) % 100).padStart(2, '0')}`
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    BUY:         'bg-green-900 text-green-300',
    SELL:        'bg-red-900 text-red-300',
    CLOSE_LONG:  'bg-blue-900 text-blue-300',
    CLOSE_SHORT: 'bg-orange-900 text-orange-300',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${map[action] ?? 'bg-gray-700 text-gray-300'}`}>
      {action.replace('_', ' ')}
    </span>
  )
}

function StatusBadge({ entry }: { entry: SessionEntry }) {
  const s = entry.dbStatus

  if (entry.result === 'awaiting') {
    return null
  }

  if (s === 'summary') {
    const cls = entry.result === 'ok' ? 'text-green-400' : 'text-orange-400'
    return <span className={cls}>{entry.message}</span>
  }

  if (s === 'pending') {
    return <span className="inline-flex items-center gap-1 text-yellow-400"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />En cola</span>
  }
  if (s === 'sent') {
    return <span className="inline-flex items-center gap-1 text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />Enviada</span>
  }
  if (s === 'filled') {
    return entry.closed
      ? <span className="text-gray-500">CERRADA</span>
      : <span className="text-green-400">EJECUTADA</span>
  }
  if (s === 'skipped') {
    const label = entry.skipReason ?? 'Saltada'
    const display = label.replace(/_/g, ' ')
    return <span className="text-orange-400" title={label}>{display}</span>
  }
  if (s === 'rejected') {
    return <span className="text-red-400">Rechazada</span>
  }
  if (s === 'error') {
    return <span className="text-red-400" title={entry.errorMsg ?? ''}>Error</span>
  }
  if (s === 'awaiting_manual') {
    return <span className="text-yellow-400">Pendiente</span>
  }

  return entry.result === 'ok'
    ? (entry.closed ? <span className="text-gray-500">CERRADA</span> : <span className="text-green-400">ABIERTA</span>)
    : <span className="text-red-400" title={entry.message}>Error</span>
}

function mapOrderToEntry(order: ApiOrder): SessionEntry {
  const isManualPending = order.status === 'awaiting_manual'
  let result: 'ok' | 'error' | 'awaiting'
  let message: string

  switch (order.status) {
    case 'awaiting_manual': result = 'awaiting'; message = 'Pendiente de envío manual'; break
    case 'pending':         result = 'ok';       message = 'En cola'; break
    case 'sent':            result = 'ok';       message = 'Enviada al broker'; break
    case 'filled':          result = 'ok';       message = order.closedAt ? 'Cerrada' : 'Ejecutada'; break
    case 'skipped':         result = 'error';    message = order.skipReason ?? 'Saltada'; break
    case 'rejected':        result = 'error';    message = 'Rechazada'; break
    case 'error':           result = 'error';    message = order.errorMsg ?? 'Error'; break
    default:                result = 'ok';       message = order.status; break
  }

  return {
    id:              `db-${order.id}`,
    timestamp:       new Date(order.createdAt),
    groupId:         order.group?.id ?? '',
    group:           order.group?.name ?? '—',
    symbol:          order.symbol,
    action:          order.side,
    signalId:        order.signalId,
    result,
    message,
    closed:          !!order.closedAt,
    closeSending:    false,
    orderId:         order.id,
    screenshotUrl:   order.signal?.screenshotUrl ?? undefined,
    isManualPending,
    sl:              order.sl ?? undefined,
    tp:              order.tp ?? undefined,
    qty:             order.qty,
    dbStatus:        order.status,
    skipReason:      order.skipReason ?? undefined,
    errorMsg:        order.errorMsg ?? undefined,
    fillPrice:       order.fillPrice ?? undefined,
  }
}

function makeSignalSummaryEntry(orders: ApiOrder[], key: string): SessionEntry {
  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
  const first = sorted[0]

  const filled  = orders.filter(o => o.status === 'filled').length
  const pending = orders.filter(o => ['pending', 'sent'].includes(o.status)).length
  const skipped = orders.filter(o => o.status === 'skipped').length
  const errors  = orders.filter(o => o.status === 'error').length

  const parts: string[] = []
  if (filled)  parts.push(`${filled} ejecutada${filled  !== 1 ? 's' : ''}`)
  if (pending) parts.push(`${pending} en cola`)
  if (skipped) {
    const reasons = [...new Set(orders.filter(o => o.status === 'skipped').map(o => o.skipReason ?? 'SALTADA'))]
    if (reasons.length === 1) {
      parts.push(`${skipped} × ${reasons[0].replace(/_/g, ' ')}`)
    } else {
      parts.push(`${skipped} saltada${skipped !== 1 ? 's' : ''}`)
    }
  }
  if (errors) parts.push(`${errors} error${errors !== 1 ? 'es' : ''}`)

  const message  = parts.join(' · ') || `${orders.length} cuentas`
  const result: 'ok' | 'error' | 'awaiting' = (filled > 0 || pending > 0) ? 'ok' : 'error'
  const screenshotUrl = orders.find(o => o.signal?.screenshotUrl)?.signal?.screenshotUrl ?? undefined

  return {
    id:              `summary-${key}`,
    timestamp:       new Date(sorted[0].createdAt),
    groupId:         first.group?.id ?? '',
    group:           first.group?.name ?? '—',
    symbol:          first.symbol,
    action:          first.side,
    signalId:        first.signalId,
    result,
    message,
    closed:          false,
    closeSending:    false,
    screenshotUrl,
    isManualPending: false,
    qty:             orders.reduce((s, o) => s + (o.qty ?? 0), 0),
    dbStatus:        'summary',
    isSummary:       true,
    orderCount:      orders.length,
  }
}

function groupOrdersForDisplay(orders: ApiOrder[]): SessionEntry[] {
  const entries: SessionEntry[] = []

  const manualOrders = orders.filter(o => o.status === 'awaiting_manual')
  const otherOrders  = orders.filter(o => o.status !== 'awaiting_manual')

  const signalGroups = new Map<string, ApiOrder[]>()
  for (const order of otherOrders) {
    const key = `${order.signalId ?? 'nosig'}:${order.group?.id ?? 'nogrp'}`
    if (!signalGroups.has(key)) signalGroups.set(key, [])
    signalGroups.get(key)!.push(order)
  }

  manualOrders.forEach(o => entries.push(mapOrderToEntry(o)))

  signalGroups.forEach((group, key) => {
    if (group.length >= 2) {
      entries.push(makeSignalSummaryEntry(group, key))
    } else {
      entries.push(mapOrderToEntry(group[0]))
    }
  })

  return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export default function ManualPanel() {
  const { t } = useLanguage()
  const [groups, setGroups]                 = useState<CopyGroup[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [symbol, setSymbol]                 = useState('')
  const [symbolError, setSymbolError]       = useState('')
  const [timeframe, setTimeframe]           = useState(DEFAULT_TF)
  const [sl, setSl]                         = useState('')
  const [tp, setTp]                         = useState('')
  const [pendingAction, setPendingAction]   = useState<ManualSignalPayload['action'] | null>(null)
  const [pendingClose, setPendingClose]     = useState<SessionEntry | null>(null)
  const [sending, setSending]               = useState(false)
  const [sessionLog, setSessionLog]         = useState<SessionEntry[]>([])
  const [globalError, setGlobalError]       = useState('')
  const [refreshing, setRefreshing]         = useState(false)

  const [manualTTL, setManualTTL]           = useState(DEFAULT_TTL)
  const manualTTLRef                        = useRef(DEFAULT_TTL)
  const [recentTickers, setRecentTickers]   = useState<string[]>(loadRecentTickers)

  const [newOrderAlert, setNewOrderAlert]   = useState<SessionEntry | null>(null)
  const [screenshotEntry, setScreenshotEntry] = useState<SessionEntry | null>(null)
  const [screenshotUrlInput, setScreenshotUrlInput] = useState('')
  const [screenshotFile, setScreenshotFile]   = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [screenshotSaving, setScreenshotSaving]   = useState(false)
  const [screenshotError, setScreenshotError]     = useState('')
  const [tick, setTick]                     = useState(0)

  // ── TradingView chart state (do NOT alter the widget integration) ──────────
  const [tvSymbol, setTvSymbol]             = useState(() => {
    const stored = localStorage.getItem('stp_tv_symbol')
    // Migrar símbolos de futuros guardados (1!) — no disponibles en el embed gratuito
    if (!stored || stored.includes('1!')) return 'CAPITALCOM:US100'
    return stored
  })
  const [chartVisible, setChartVisible]     = useState(() => localStorage.getItem('stp_chart_visible') !== 'false')

  const knownDbOrderIds  = useRef<Set<string>>(new Set())
  const knownAwaitingIds = useRef<Set<string>>(new Set())
  const expiredIds       = useRef<Set<string>>(new Set())

  // ── Auto-map form symbol → TradingView symbol ─────────────────────────────
  useEffect(() => {
    if (!symbol || symbol.length < 2) return
    const s = symbol.toUpperCase()
    // NOTA: los contratos continuos CME (MNQ1!, NQ1!) están bloqueados en los
    // widgets embebidos gratuitos ("Símbolo solo disponible en TradingView").
    // Usamos índices/CFDs equivalentes que sí están disponibles y siguen al futuro.
    let tv = ''
    if      (s.startsWith('MNQ')) tv = 'CAPITALCOM:US100'
    else if (s.startsWith('MES')) tv = 'CAPITALCOM:US500'
    else if (s.startsWith('M2K')) tv = 'CAPITALCOM:US2000'
    else if (s.startsWith('MYM')) tv = 'CAPITALCOM:US30'
    else if (s.startsWith('NQ'))  tv = 'CAPITALCOM:US100'
    else if (s.startsWith('ES'))  tv = 'CAPITALCOM:US500'
    else if (s.startsWith('RTY')) tv = 'CAPITALCOM:US2000'
    else if (s.startsWith('YM'))  tv = 'CAPITALCOM:US30'
    else if (s.startsWith('MGC')) tv = 'TVC:GOLD'
    else if (s.startsWith('MCL')) tv = 'TVC:USOIL'
    else if (s.startsWith('GC'))  tv = 'TVC:GOLD'
    else if (s.startsWith('CL'))  tv = 'TVC:USOIL'
    else if (s.startsWith('ZN'))  tv = 'TVC:US10Y'
    else if (s.startsWith('ZB'))  tv = 'TVC:US30Y'
    if (tv && tv !== tvSymbol) {
      setTvSymbol(tv)
      localStorage.setItem('stp_tv_symbol', tv)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  // ── Load groups + settings ─────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get<CopyGroup[]>('/api/groups'),
      api.get<Record<string, string>>('/api/admin/settings').catch(() => ({} as Record<string, string>)),
    ]).then(([g, settings]) => {
      setGroups(g)
      if (g.length > 0) setSelectedGroupId(g[0].id)
      if (settings.defaultTimeframe) setTimeframe(settings.defaultTimeframe)
      const ttl = Number(settings.manualOrderTTL)
      if (!isNaN(ttl) && ttl >= 10) {
        setManualTTL(ttl)
        manualTTLRef.current = ttl
      }
    })
      .catch(err => setGlobalError(err instanceof Error ? err.message : t('error')))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load / refresh recent orders from DB ───────────────────────────────────
  async function loadRecentOrders(showSpinner = false) {
    if (showSpinner) setRefreshing(true)
    try {
      const { orders } = await api.get<{ orders: ApiOrder[] }>('/api/orders?limit=40')

      orders.forEach(o => knownDbOrderIds.current.add(o.id))

      setSessionLog(prev => {
        const dbEntries = groupOrdersForDisplay(orders)

        const prevById = new Map(prev.map(e => [e.id, e]))
        const mergedDb = dbEntries.map(e => {
          const old = prevById.get(e.id)
          if (!old) return e
          return { ...e, closeSending: old.closeSending || e.closeSending, closed: old.closed || e.closed }
        })

        const dbOrderIds = new Set(orders.map(o => o.id))
        const sseOnly = prev.filter(e => e.isManualPending && e.orderId && !dbOrderIds.has(e.orderId))

        const all = [...mergedDb, ...sseOnly]
        all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        return all.slice(0, 60)
      })
    } catch {
      /* ignore network errors on refresh */
    } finally {
      if (showSpinner) setRefreshing(false)
    }
  }

  function openScreenshotModal(entry: SessionEntry) {
    setScreenshotEntry(entry)
    setScreenshotUrlInput(entry.screenshotUrl ?? '')
    setScreenshotFile(null)
    setScreenshotPreview(entry.screenshotUrl ?? null)
    setScreenshotError('')
  }

  function handleScreenshotFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScreenshotFile(file)
    setScreenshotError('')
    const reader = new FileReader()
    reader.onload = ev => setScreenshotPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    setScreenshotUrlInput('')
  }

  async function saveScreenshot() {
    if (!screenshotEntry?.signalId) return
    setScreenshotSaving(true)
    setScreenshotError('')
    try {
      let body: Record<string, string>

      if (screenshotFile) {
        const imageData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload  = e => resolve(e.target?.result as string)
          reader.onerror = reject
          reader.readAsDataURL(screenshotFile)
        })
        body = { imageData, mimeType: screenshotFile.type }
      } else if (screenshotUrlInput.trim()) {
        body = { url: screenshotUrlInput.trim() }
      } else {
        setScreenshotError(t('ord_paste_url'))
        return
      }

      const { screenshotUrl } = await api.patch<{ screenshotUrl: string }>(
        `/api/signals/${screenshotEntry.signalId}/screenshot`,
        body,
      )

      setSessionLog(prev => prev.map(e =>
        e.signalId === screenshotEntry.signalId ? { ...e, screenshotUrl } : e
      ))
      setScreenshotEntry(prev => prev ? { ...prev, screenshotUrl } : null)
      setScreenshotPreview(screenshotUrl)
      setScreenshotFile(null)
    } catch (err) {
      setScreenshotError(err instanceof Error ? err.message : t('error'))
    } finally {
      setScreenshotSaving(false)
    }
  }

  async function clearScreenshot() {
    if (!screenshotEntry?.signalId) return
    setScreenshotSaving(true)
    setScreenshotError('')
    try {
      await api.patch<{ screenshotUrl: null }>(
        `/api/signals/${screenshotEntry.signalId}/screenshot`,
        { clear: true },
      )
      setSessionLog(prev => prev.map(e =>
        e.signalId === screenshotEntry.signalId ? { ...e, screenshotUrl: undefined } : e
      ))
      setScreenshotEntry(prev => prev ? { ...prev, screenshotUrl: undefined } : null)
      setScreenshotPreview(null)
      setScreenshotUrlInput('')
      setScreenshotFile(null)
    } catch (err) {
      setScreenshotError(err instanceof Error ? err.message : t('error'))
    } finally {
      setScreenshotSaving(false)
    }
  }

  // Initial load + periodic refresh
  useEffect(() => {
    loadRecentOrders(true)
    const interval = setInterval(() => loadRecentOrders(false), REFRESH_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Auto-expire when countdown hits 0
  useEffect(() => {
    setSessionLog(prev => {
      let changed = false
      const next = prev.map(entry => {
        if (!entry.isManualPending || !entry.orderId) return entry
        if (expiredIds.current.has(entry.orderId)) return entry
        const elapsed = Math.floor((Date.now() - entry.timestamp.getTime()) / 1000)
        if (elapsed >= manualTTLRef.current) {
          expiredIds.current.add(entry.orderId)
          changed = true
          api.post(`/api/orders/${entry.orderId}/expire`, {}).catch(() => {})
          return { ...entry, result: 'error' as const, message: `Expirada — ${manualTTLRef.current}s`, isManualPending: false, dbStatus: 'skipped', skipReason: 'MANUAL_TIMEOUT' }
        }
        return entry
      })
      return changed ? next : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  // Auto-dismiss alert
  useEffect(() => {
    if (!newOrderAlert) return
    const timer = setTimeout(() => setNewOrderAlert(null), 30_000)
    return () => clearTimeout(timer)
  }, [newOrderAlert])

  // SSE: receive awaiting_manual orders in real time
  useEffect(() => {
    function handleAwaitingOrder(order: AwaitingOrder) {
      if (knownAwaitingIds.current.has(order.id)) return
      knownAwaitingIds.current.add(order.id)
      knownDbOrderIds.current.add(order.id)

      const entryId = `db-${order.id}`
      const entry: SessionEntry = {
        id:              entryId,
        timestamp:       new Date(order.createdAt),
        groupId:         order.group?.id ?? '',
        group:           order.group?.name ?? '—',
        symbol:          order.symbol,
        action:          order.side,
        signalId:        order.signalId,
        result:          'awaiting',
        message:         'Pendiente de envío manual',
        closed:          false,
        closeSending:    false,
        orderId:         order.id,
        screenshotUrl:   order.signal?.screenshotUrl ?? undefined,
        isManualPending: true,
        sl:              order.sl ?? undefined,
        tp:              order.tp ?? undefined,
        qty:             order.qty,
        dbStatus:        'awaiting_manual',
      }

      setSessionLog(prev => {
        if (prev.some(e => e.id === entryId)) {
          return prev.map(e => e.id === entryId ? entry : e)
        }
        return [entry, ...prev].slice(0, 60)
      })
      setNewOrderAlert(entry)

      if ('Notification' in window && Notification.permission === 'granted') {
        const ttl = manualTTLRef.current
        const n = new Notification('⚡ CopyTrader Pro — Orden Manual', {
          body: `${order.side} ${order.symbol}  ·  Grupo: ${order.group?.name ?? '?'}  ·  Tienes ${ttl}s para aprobar`,
          icon: '/favicon.svg',
        })
        setTimeout(() => n.close(), 15_000)
      }
    }

    let evtSource: EventSource | null = null

    async function connectSSE() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      evtSource = new EventSource(`/api/events/stream?token=${encodeURIComponent(session.access_token)}`)

      evtSource.addEventListener('manual_order', (e: MessageEvent) => {
        try {
          const order: AwaitingOrder = JSON.parse(e.data)
          handleAwaitingOrder(order)
        } catch { /* ignore parse errors */ }
      })

      evtSource.onerror = () => {
        // EventSource reconnects automatically
      }
    }

    connectSSE().catch(() => {})

    return () => {
      evtSource?.close()
    }
  }, [])

  // ── Send manual order (awaiting → broker) ──────────────────────────────────
  async function handleSubmit(entry: SessionEntry) {
    if (!entry.orderId) return
    setSessionLog(prev => prev.map(e =>
      e.id === entry.id ? { ...e, closeSending: true, isManualPending: false } : e
    ))
    try {
      await api.post(`/api/orders/${entry.orderId}/submit`, {})
      setSessionLog(prev => prev.map(e =>
        e.id === entry.id
          ? { ...e, result: 'ok' as const, message: 'Enviada al broker', closeSending: false, dbStatus: 'sent' }
          : e
      ))
      setTimeout(() => loadRecentOrders(false), 3_000)
    } catch (err) {
      setSessionLog(prev => prev.map(e =>
        e.id === entry.id ? { ...e, closeSending: false, isManualPending: true } : e
      ))
      setGlobalError(err instanceof Error ? err.message : t('error'))
    }
  }

  // ── Symbol validation ──────────────────────────────────────────────────────
  function validateSymbol(value: string): boolean {
    if (!value.trim()) { setSymbolError(t('man_symbol') + ' ' + t('grp_name_required').toLowerCase()); return false }
    if (!SYMBOL_REGEX.test(value.trim().toUpperCase())) {
      setSymbolError('Formato inválido. Ejemplo: MNQU25, ESU24')
      return false
    }
    setSymbolError('')
    return true
  }

  function handleSymbolChange(value: string) {
    const upper = value.toUpperCase()
    setSymbol(upper)
    if (upper) validateSymbol(upper)
    else setSymbolError('')
  }

  // ── BUY / SELL ─────────────────────────────────────────────────────────────
  function requestAction(action: ManualSignalPayload['action']) {
    if (!selectedGroupId) { setGlobalError(t('man_copy_group') + ': ' + t('grp_name_required').toLowerCase()); return }
    if (!validateSymbol(symbol)) return
    setGlobalError('')
    setPendingAction(action)
  }

  async function confirmAction() {
    if (!pendingAction || !selectedGroupId || !symbol) return
    setSending(true)
    const group = groups.find(g => g.id === selectedGroupId)
    const payload: ManualSignalPayload = {
      groupId:  selectedGroupId,
      symbol:   symbol.trim().toUpperCase(),
      action:   pendingAction,
      timeframe,
      ...(sl && !isNaN(Number(sl)) && Number(sl) > 0 ? { sl: Number(sl) } : {}),
      ...(tp && !isNaN(Number(tp)) && Number(tp) > 0 ? { tp: Number(tp) } : {}),
    }
    try {
      await api.post<{ received: boolean; signalId: string }>('/api/manual/signal', payload)

      // Recordar el ticker usado — sube al frente de los chips rápidos
      const root = tickerRoot(payload.symbol)
      if (root) {
        setRecentTickers(prev => {
          const next = [root, ...prev.filter(r => r !== root)].slice(0, 8)
          localStorage.setItem(RECENT_TICKERS_KEY, JSON.stringify(next))
          return next
        })
      }

      setTimeout(() => loadRecentOrders(false), 1_500)
      setTimeout(() => loadRecentOrders(false), 5_000)
    } catch (err) {
      setSessionLog(prev => [{
        id:           crypto.randomUUID(),
        timestamp:    new Date(),
        groupId:      selectedGroupId,
        group:        group?.name ?? selectedGroupId,
        symbol:       payload.symbol,
        action:       pendingAction,
        signalId:     '',
        result:       'error' as const,
        message:      err instanceof Error ? err.message : t('error'),
        closed:       false,
        closeSending: false,
      }, ...prev].slice(0, 60))
    } finally {
      setSending(false)
      setPendingAction(null)
    }
  }

  // ── CLOSE per row ──────────────────────────────────────────────────────────
  function requestClose(entry: SessionEntry) { setPendingClose(entry) }

  async function confirmClose() {
    if (!pendingClose) return
    const closeAction: ManualSignalPayload['action'] =
      pendingClose.action === 'BUY' ? 'CLOSE_LONG' : 'CLOSE_SHORT'

    setSessionLog(prev =>
      prev.map(e => e.id === pendingClose.id ? { ...e, closeSending: true } : e)
    )
    setPendingClose(null)

    try {
      await api.post<{ received: boolean; signalId: string }>('/api/manual/signal', {
        groupId: pendingClose.groupId,
        symbol:  pendingClose.symbol,
        action:  closeAction,
      })
      setSessionLog(prev =>
        prev.map(e => e.id === pendingClose.id ? { ...e, closed: true, closeSending: false } : e)
      )
      setTimeout(() => loadRecentOrders(false), 2_000)
    } catch (err) {
      setSessionLog(prev =>
        prev.map(e => e.id === pendingClose.id ? { ...e, closeSending: false } : e)
      )
      setGlobalError(err instanceof Error ? err.message : t('error'))
    }
  }

  const selectedGroup  = groups.find(g => g.id === selectedGroupId)
  const followerCount  = selectedGroup?._count?.followers ?? selectedGroup?.followers?.length ?? 0

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-100">{t('man_title')}</h1>

      {/* Global error */}
      {globalError && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm flex items-start gap-2">
          <span className="flex-1">{globalError}</span>
          <button className="text-red-400 hover:text-red-300" onClick={() => setGlobalError('')}>✕</button>
        </div>
      )}

      {/* New manual order alert (from TradingView) */}
      {newOrderAlert && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚡</span>
          <div className="flex-1">
            <p className="text-yellow-300 font-semibold text-sm">¡Nueva orden manual pendiente!</p>
            <p className="text-yellow-400/80 text-xs mt-0.5">
              <span className={`font-bold ${newOrderAlert.action === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                {newOrderAlert.action}
              </span>
              {' '}{newOrderAlert.symbol} · {t('man_group')}: <strong>{newOrderAlert.group}</strong> · {manualTTL}s
            </p>
          </div>
          <button onClick={() => setNewOrderAlert(null)} className="text-yellow-500 hover:text-yellow-300 text-lg leading-none">✕</button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_420px]">
        {/* Column 1: Form (sticky) */}
        <div className="xl:sticky xl:top-24 xl:self-start">

          {/* Manual signal form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">

            {/* Group */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">{t('man_copy_group')} *</label>
              {groups.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('grp_no_groups')}</p>
              ) : (
                <select
                  value={selectedGroupId}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                >
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              {selectedGroup && <p className="text-xs text-gray-500 mt-1">{followerCount} cuenta(s) copiadora(s)</p>}
            </div>

            {/* Symbol */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">{t('man_symbol')} *</label>

              {/* Tickers rápidos — últimos usados primero, contrato vigente automático */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[...new Set([...recentTickers, ...QUICK_TICKERS])].slice(0, 8).map(root => {
                  const active = symbol.startsWith(root) && symbol.length > root.length
                  return (
                    <button
                      key={root} type="button"
                      onClick={() => handleSymbolChange(`${root}${frontQuarterCode()}`)}
                      className={`px-2 py-1 rounded-md text-xs font-mono font-semibold border transition-colors ${
                        active
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                      }`}
                      title={`${root}${frontQuarterCode()}`}
                    >{root}</button>
                  )
                })}
              </div>

              <input
                type="text"
                value={symbol}
                onChange={e => handleSymbolChange(e.target.value)}
                className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-gray-100 focus:outline-none text-sm font-mono uppercase ${
                  symbolError ? 'border-red-600 focus:border-red-500' : 'border-gray-700 focus:border-blue-500'
                }`}
                placeholder={`MNQ${frontQuarterCode()}`}
                maxLength={10}
              />
              {symbolError && <p className="text-red-400 text-xs mt-1">{symbolError}</p>}
            </div>

            {/* TimeFrame */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">{t('man_timeframe')}</label>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf} type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                      timeframe === tf
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >{tf}</button>
                ))}
              </div>
            </div>

            {/* SL / TP */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t('man_sl')} / {t('man_tp')}
                <span className="ml-1 text-gray-500 font-normal text-xs">(opcional · precio absoluto)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'sl', label: 'SL', textClass: 'text-red-400',   focusClass: 'focus:border-red-500',   value: sl, setter: setSl },
                  { key: 'tp', label: 'TP', textClass: 'text-green-400', focusClass: 'focus:border-green-500', value: tp, setter: setTp },
                ] as const).map(({ key, label, textClass, focusClass, value, setter }) => (
                  <div key={key}>
                    <div className="relative">
                      <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold pointer-events-none ${textClass}`}>{label}</span>
                      <input
                        type="number" value={value}
                        onChange={e => setter(e.target.value)}
                        placeholder="0.00" step="0.25" min="0"
                        className={`w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 font-mono focus:outline-none ${focusClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* BUY / SELL — trading terms stay in English */}
            <div>
              <label className="block text-sm text-gray-400 mb-3">{t('man_action')}</label>
              <div className="grid grid-cols-2 gap-3">
                {(['BUY', 'SELL'] as const).map(action => (
                  <button
                    key={action} type="button"
                    onClick={() => requestAction(action)}
                    disabled={groups.length === 0}
                    className={`py-4 rounded-xl text-lg font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      action === 'BUY'
                        ? 'bg-green-700 hover:bg-green-600 text-white border-green-600'
                        : 'bg-red-700 hover:bg-red-600 text-white border-red-600'
                    }`}
                  >{action}</button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Los cierres (CLOSE LONG / CLOSE SHORT) se envían desde cada orden en el log.
              </p>
            </div>
          </div>
        </div>

        {/* Column 2: TradingView Chart */}
        <div
          className="xl:sticky xl:top-24 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col"
          style={{ height: 'calc(100vh - 160px)', minHeight: 480 }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg>
              <span className="text-sm font-semibold text-gray-200">Gráfica</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-mono text-gray-500"
                title="El gráfico sigue al símbolo del formulario — también puedes buscar otro con la lupa del chart"
              >
                {tvSymbol}
              </span>
              <button
                onClick={() => {
                  const next = !chartVisible
                  setChartVisible(next)
                  localStorage.setItem('stp_chart_visible', String(next))
                }}
                className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800 transition-colors whitespace-nowrap"
              >
                {chartVisible ? t('grp_hide') : 'Mostrar'}
              </button>
            </div>
          </div>
          {chartVisible ? (
            <div className="flex-1 min-h-0">
              <TradingViewWidget key={tvSymbol} symbol={tvSymbol} interval={timeframe} height="100%" />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-600 text-sm">
                Gráfica oculta ·{' '}
                <button
                  className="text-blue-500 hover:text-blue-400"
                  onClick={() => { setChartVisible(true); localStorage.setItem('stp_chart_visible', 'true') }}
                >
                  Mostrar
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Column 3: Session log */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-100">{t('man_session_log')}</h2>
              {sessionLog.filter(e => e.isManualPending).length > 0 && (
                <span className="text-xs text-yellow-400 font-medium">
                  {sessionLog.filter(e => e.isManualPending).length} pendiente(s)
                </span>
              )}
            </div>
            <button
              onClick={() => loadRecentOrders(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs transition-colors disabled:opacity-50"
            >
              <svg className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {refreshing ? t('refreshing') : t('refresh')}
            </button>
          </div>

          {sessionLog.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              {refreshing ? t('loading') : t('man_no_session')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="text-left px-3 py-2 font-medium">{t('man_time')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('man_group')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('man_symbol')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('man_action')}</th>
                    <th className="text-left px-3 py-2 font-medium">Ctd</th>
                    <th className="text-left px-3 py-2 font-medium">{t('status')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('actions')}</th>
                    <th className="text-left px-3 py-2 font-medium">Img</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionLog.map(entry => {
                    const elapsed     = Math.floor((Date.now() - entry.timestamp.getTime()) / 1000)
                    const secondsLeft = Math.max(0, manualTTL - elapsed)
                    void tick

                    const canClose =
                      !entry.isSummary &&
                      !entry.closeSending && !entry.closed && !entry.isManualPending &&
                      (entry.action === 'BUY' || entry.action === 'SELL') &&
                      (entry.result === 'ok') &&
                      (entry.dbStatus === 'filled' || !entry.dbStatus)

                    const closeLabel = entry.action === 'BUY' ? 'CLOSE LONG' : 'CLOSE SHORT'
                    const closeCls   = entry.action === 'BUY'
                      ? 'bg-blue-700 hover:bg-blue-600 text-white'
                      : 'bg-orange-700 hover:bg-orange-600 text-white'

                    const countdownCls = secondsLeft > 30
                      ? 'text-yellow-400'
                      : secondsLeft > 10
                      ? 'text-orange-400'
                      : 'text-red-400 animate-pulse'

                    return (
                      <tr key={entry.id} className={`border-b border-gray-800/40 hover:bg-gray-800/20 ${
                        entry.isManualPending ? 'bg-yellow-900/10' : ''
                      }`}>
                        {/* Time */}
                        <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                          {entry.timestamp.toLocaleTimeString([], {
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </td>
                        {/* Group */}
                        <td className="px-3 py-2 text-gray-300 truncate max-w-[80px]">{entry.group}</td>
                        {/* Symbol + SL/TP mini */}
                        <td className="px-3 py-2">
                          <div className="text-gray-100 font-mono font-semibold">{entry.symbol}</div>
                          {(entry.sl || entry.tp) && (
                            <div className="flex gap-1.5 mt-0.5">
                              {entry.sl && <span className="text-red-400/70 font-mono">SL {entry.sl.toLocaleString()}</span>}
                              {entry.tp && <span className="text-green-400/70 font-mono">TP {entry.tp.toLocaleString()}</span>}
                            </div>
                          )}
                          {entry.fillPrice && (
                            <div className="text-gray-500 font-mono mt-0.5">@ {entry.fillPrice.toLocaleString()}</div>
                          )}
                        </td>
                        {/* Action */}
                        <td className="px-3 py-2"><ActionBadge action={entry.action} /></td>
                        {/* Qty */}
                        <td className="px-3 py-2 text-gray-400 font-mono">
                          {entry.isSummary
                            ? <span className="text-gray-500 text-xs">×{entry.orderCount} ctas</span>
                            : entry.qty != null ? entry.qty : '—'
                          }
                        </td>
                        {/* Status */}
                        <td className="px-3 py-2">
                          {entry.result === 'awaiting' ? (
                            <div className={`flex items-center gap-1 font-mono font-bold ${countdownCls}`}>
                              <span>⏱</span>
                              <span>{secondsLeft}s</span>
                            </div>
                          ) : (
                            <StatusBadge entry={entry} />
                          )}
                        </td>
                        {/* Quick action */}
                        <td className="px-3 py-2">
                          {entry.closeSending ? (
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          ) : entry.isManualPending && entry.result === 'awaiting' && secondsLeft > 0 ? (
                            <button
                              onClick={() => handleSubmit(entry)}
                              className="px-2 py-1 rounded text-xs font-bold bg-green-700 hover:bg-green-600 text-white transition-colors"
                            >
                              ENVIAR
                            </button>
                          ) : canClose ? (
                            <button
                              onClick={() => requestClose(entry)}
                              className={`px-2 py-1 rounded text-xs font-bold transition-colors ${closeCls}`}
                            >
                              {closeLabel}
                            </button>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                        {/* Image */}
                        <td className="px-3 py-2">
                          {entry.signalId ? (
                            entry.screenshotUrl ? (
                              <button
                                onClick={() => openScreenshotModal(entry)}
                                title={t('ord_view_edit_image')}
                                className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => openScreenshotModal(entry)}
                                title={t('ord_add_image')}
                                className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                                </svg>
                              </button>
                            )
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Screenshot modal */}
      {screenshotEntry && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setScreenshotEntry(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">{t('ord_screenshot')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {screenshotEntry.symbol} · {screenshotEntry.action} · {screenshotEntry.group}
                </p>
              </div>
              <button
                onClick={() => setScreenshotEntry(null)}
                className="text-gray-400 hover:text-gray-100 text-lg leading-none"
              >✕</button>
            </div>

            <div className="p-4 space-y-4">
              {/* Preview */}
              <div className="rounded-lg border border-gray-800 overflow-hidden bg-gray-950 min-h-[160px] flex items-center justify-center">
                {screenshotPreview ? (
                  <img
                    src={screenshotPreview}
                    alt="Screenshot"
                    className="w-full max-h-72 object-contain"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      setScreenshotError('No se pudo cargar la imagen')
                    }}
                  />
                ) : (
                  <p className="text-gray-600 text-sm">{t('ord_no_image')}</p>
                )}
              </div>

              {/* Option A: URL */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">{t('ord_paste_url')}</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={screenshotUrlInput}
                    onChange={e => {
                      setScreenshotUrlInput(e.target.value)
                      setScreenshotFile(null)
                      if (e.target.value) setScreenshotPreview(e.target.value)
                      else setScreenshotPreview(screenshotEntry.screenshotUrl ?? null)
                    }}
                    placeholder="https://..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    onClick={saveScreenshot}
                    disabled={screenshotSaving || !screenshotUrlInput.trim()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    {screenshotSaving ? '...' : t('ord_save_url')}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-gray-600">o</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>

              {/* Option B: file */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">{t('ord_upload_file')}</label>
                <div className="flex gap-2 items-center">
                  <label className="flex-1 cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 border-dashed rounded-lg px-3 py-2 text-sm text-gray-400 text-center transition-colors">
                    {screenshotFile ? screenshotFile.name : '📎  Seleccionar archivo...'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif"
                      className="hidden"
                      onChange={handleScreenshotFileChange}
                    />
                  </label>
                  <button
                    onClick={saveScreenshot}
                    disabled={screenshotSaving || !screenshotFile}
                    className="px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    {screenshotSaving ? '...' : 'Subir'}
                  </button>
                </div>
              </div>

              {/* Error */}
              {screenshotError && (
                <p className="text-red-400 text-xs">{screenshotError}</p>
              )}

              {/* Extra actions if image exists */}
              {screenshotEntry.screenshotUrl && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <a
                    href={screenshotEntry.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-400"
                  >
                    {t('ord_open_tab')}
                  </a>
                  <button
                    onClick={clearScreenshot}
                    disabled={screenshotSaving}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                  >
                    {screenshotSaving ? t('ord_removing') : t('ord_remove_image')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm BUY / SELL modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-100">Confirmar orden manual</h2>
            <div className="bg-gray-800 rounded-lg p-4 space-y-2 text-sm">
              {[
                [t('man_group'),     selectedGroup?.name],
                [t('man_symbol'),    symbol],
                [t('man_timeframe'), timeframe],
                [t('man_action'),    pendingAction],
                ...(sl && Number(sl) > 0 ? [[t('man_sl'), Number(sl).toLocaleString()]] : []),
                ...(tp && Number(tp) > 0 ? [[t('man_tp'), Number(tp).toLocaleString()]] : []),
                ['Seguidores', `${followerCount} cuenta(s)`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}:</span>
                  <span className={`font-semibold ${
                    label === t('man_action') && pendingAction === 'BUY'  ? 'text-green-400' :
                    label === t('man_action') && pendingAction === 'SELL' ? 'text-red-400' :
                    label === t('man_sl') ? 'text-red-400 font-mono' :
                    label === t('man_tp') ? 'text-green-400 font-mono' :
                    label === t('man_symbol') ? 'text-gray-100 font-mono' :
                    'text-gray-100'
                  }`}>{val}</span>
                </div>
              ))}
            </div>
            <p className="text-yellow-400 text-xs">
              Esta acción se enviará a todas las cuentas activas del grupo.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmAction}
                disabled={sending}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold"
              >
                {sending ? t('sending') : 'Confirmar'}
              </button>
              <button
                onClick={() => setPendingAction(null)}
                disabled={sending}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg font-medium"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm close modal */}
      {pendingClose && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-100">Confirmar cierre de posición</h2>
            <div className="bg-gray-800 rounded-lg p-4 space-y-2 text-sm">
              {[
                [t('man_group'),  pendingClose.group],
                [t('man_symbol'), pendingClose.symbol],
                ['Posición',      pendingClose.action],
                ['Cierre',        pendingClose.action === 'BUY' ? 'CLOSE LONG' : 'CLOSE SHORT'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}:</span>
                  <span className={`font-semibold ${
                    label === 'Posición' && pendingClose.action === 'BUY'  ? 'text-green-400' :
                    label === 'Posición' && pendingClose.action === 'SELL' ? 'text-red-400' :
                    label === 'Cierre' ? 'text-blue-400' : 'text-gray-100'
                  }`}>{val}</span>
                </div>
              ))}
            </div>
            <p className="text-yellow-400 text-xs">Cierra todas las posiciones abiertas de este símbolo en el grupo.</p>
            <div className="flex gap-3">
              <button
                onClick={confirmClose}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-white ${
                  pendingClose.action === 'BUY' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {pendingClose.action === 'BUY' ? 'Confirmar CLOSE LONG' : 'Confirmar CLOSE SHORT'}
              </button>
              <button
                onClick={() => setPendingClose(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg font-medium"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
