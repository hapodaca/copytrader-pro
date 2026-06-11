import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import { exportToXLSX, exportToPDF, ExportColumn } from '../lib/exportTable'

interface SeriesPoint {
  date: string
  pnl: number
  trades: number
  wins: number
  losses: number
  cumPnl: number
}

interface SymbolRow {
  symbol: string
  trades: number
  wins: number
  losses: number
  winRate: number | null
}

interface AccountRow {
  accountId: string
  accountName: string
  pnl: number
  trades: number
  wins: number
  losses: number
  winRate: number | null
}

interface Summary {
  from: string
  to: string
  kpis: {
    totalPnl: number
    trades: number
    wins: number
    losses: number
    winRate: number | null
    tradingDays: number
    avgDailyPnl: number
    bestDay: { date: string; pnl: number } | null
    worstDay: { date: string; pnl: number } | null
  }
  series: SeriesPoint[]
  bySymbol: SymbolRow[]
  byAccount: AccountRow[]
}

interface Account {
  id: string
  name: string
}

const fmtUsd = (v: number) =>
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

function pnlTone(v: number): string {
  if (v > 0) return 'text-green-300'
  if (v < 0) return 'text-red-300'
  return 'text-gray-100'
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

// ── Curva de equity (SVG, sin dependencias) ──────────────────────────────────
function EquityCurve({ series }: { series: SeriesPoint[] }) {
  if (series.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-500">Sin datos en el período seleccionado</p>
  }

  const W = 820, H = 240
  const PL = 56, PR = 14, PT = 14, PB = 26
  const CW = W - PL - PR, CH = H - PT - PB

  const values = series.map(p => p.cumPnl)
  let min = Math.min(0, ...values)
  let max = Math.max(0, ...values)
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.08
  min -= pad; max += pad

  const toX = (i: number) => PL + (series.length === 1 ? CW / 2 : (i / (series.length - 1)) * CW)
  const toY = (v: number) => PT + CH - ((v - min) / (max - min)) * CH

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.cumPnl).toFixed(1)}`).join(' ')
  const area = `${line} L${toX(series.length - 1).toFixed(1)},${toY(0).toFixed(1)} L${toX(0).toFixed(1)},${toY(0).toFixed(1)} Z`

  const last = series[series.length - 1]
  const positive = last.cumPnl >= 0
  const stroke = positive ? '#34d399' : '#f87171'

  const gridLines = 4
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) => min + ((max - min) * i) / gridLines)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Curva de equity">
      {gridVals.map(v => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={toY(v)} y2={toY(v)} stroke="#1f2937" strokeWidth="1" />
          <text x={PL - 6} y={toY(v) + 3.5} textAnchor="end" fontSize="10" fill="#6b7280" fontFamily="monospace">
            {Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
          </text>
        </g>
      ))}
      <line x1={PL} x2={W - PR} y1={toY(0)} y2={toY(0)} stroke="#4b5563" strokeWidth="1" strokeDasharray="4 3" />
      <path d={area} fill={stroke} opacity="0.12" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={toX(series.length - 1)} cy={toY(last.cumPnl)} r="3.5" fill={stroke} />
      <text x={PL} y={H - 8} fontSize="10" fill="#6b7280">{fmtDay(series[0].date)}</text>
      <text x={W - PR} y={H - 8} fontSize="10" fill="#6b7280" textAnchor="end">{fmtDay(last.date)}</text>
    </svg>
  )
}

// ── Heatmap calendario de PnL diario ─────────────────────────────────────────
function PnlHeatmap({ series, from, to }: { series: SeriesPoint[]; from: string; to: string }) {
  const byDate = useMemo(() => new Map(series.map(p => [p.date, p])), [series])

  const weeks = useMemo(() => {
    const start = new Date(`${from}T12:00:00Z`)
    const end = new Date(`${to}T12:00:00Z`)
    // Retroceder al lunes de la semana inicial
    const day = (start.getUTCDay() + 6) % 7 // 0 = lunes
    start.setUTCDate(start.getUTCDate() - day)

    const result: Array<Array<{ iso: string; inRange: boolean }>> = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const week: Array<{ iso: string; inRange: boolean }> = []
      for (let i = 0; i < 7; i++) {
        const iso = cursor.toISOString().slice(0, 10)
        week.push({ iso, inRange: iso >= from && iso <= to })
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
      result.push(week)
    }
    return result
  }, [from, to])

  const maxAbs = useMemo(
    () => Math.max(1, ...series.map(p => Math.abs(p.pnl))),
    [series]
  )

  function cellColor(iso: string, inRange: boolean): string {
    if (!inRange) return 'transparent'
    const p = byDate.get(iso)
    if (!p || p.trades === 0) return '#1f2937'
    if (p.pnl === 0) return '#374151'
    const intensity = 0.35 + 0.65 * Math.min(1, Math.abs(p.pnl) / maxAbs)
    return p.pnl > 0
      ? `rgba(52, 211, 153, ${intensity.toFixed(2)})`
      : `rgba(248, 113, 113, ${intensity.toFixed(2)})`
  }

  const CELL = 13, GAP = 3
  const width = weeks.length * (CELL + GAP) + 24
  const height = 7 * (CELL + GAP) + 4
  const dayLabels = ['L', '', 'X', '', 'V', '', '']

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label="PnL por día">
        {dayLabels.map((lbl, i) => lbl && (
          <text key={i} x={0} y={i * (CELL + GAP) + CELL - 2} fontSize="9" fill="#6b7280">{lbl}</text>
        ))}
        {weeks.map((week, w) =>
          week.map((cell, d) => {
            const p = byDate.get(cell.iso)
            return (
              <rect
                key={cell.iso}
                x={24 + w * (CELL + GAP)}
                y={d * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2.5}
                fill={cellColor(cell.iso, cell.inRange)}
              >
                {cell.inRange && (
                  <title>
                    {fmtDay(cell.iso)} — {p && p.trades > 0 ? `${fmtUsd(p.pnl)} · ${p.trades} trade(s)` : 'sin trades'}
                  </title>
                )}
              </rect>
            )
          })
        )}
      </svg>
    </div>
  )
}

function KpiCard({ label, value, sub, valueClass }: {
  label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${valueClass ?? 'text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

const EXPORT_COLS: ExportColumn[] = [
  { header: 'Fecha', key: 'date' },
  { header: 'PnL', key: 'pnl' },
  { header: 'Acumulado', key: 'cumPnl' },
  { header: 'Trades', key: 'trades' },
  { header: 'Ganadas', key: 'wins' },
  { header: 'Perdidas', key: 'losses' },
]

export default function Reports() {
  const { t } = useLanguage()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [from, setFrom] = useState(() => isoDaysAgo(29))
  const [to, setTo] = useState(() => isoDaysAgo(0))
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Account[]>('/api/accounts').then(setAccounts).catch(() => {})
  }, [])

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      if (accountId) params.set('accountId', accountId)
      const result = await api.get<Summary>(`/api/reports/summary?${params}`)
      setData(result)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }, [from, to, accountId, t])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const k = data?.kpis

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{t('rep_title')}</h1>
          <p className="mt-1 text-sm text-gray-400">{t('rep_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => data && exportToXLSX('reporte', EXPORT_COLS, data.series as unknown as Record<string, unknown>[])}
            disabled={!data || data.series.length === 0}
            className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-40"
          >↓ XLSX</button>
          <button
            onClick={() => data && exportToPDF('reporte', `Reporte ${data.from} → ${data.to}`, EXPORT_COLS, data.series as unknown as Record<string, unknown>[])}
            disabled={!data || data.series.length === 0}
            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
          >↓ PDF</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:max-w-2xl">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Desde</label>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Hasta</label>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Cuenta</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none">
              <option value="">Todas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">{error}</div>}

      {loading && !data ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : data && (
        <>
          {/* KPIs */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="PnL del período"
              value={fmtUsd(k!.totalPnl)}
              sub={`${k!.tradingDays} día(s) operado(s) · prom. ${fmtUsd(k!.avgDailyPnl)}/día`}
              valueClass={pnlTone(k!.totalPnl)}
            />
            <KpiCard
              label="Win rate"
              value={k!.winRate != null ? `${k!.winRate}%` : '—'}
              sub={`${k!.wins} ganadas · ${k!.losses} perdidas`}
            />
            <KpiCard label="Trades" value={String(k!.trades)} sub="órdenes ejecutadas" />
            <KpiCard
              label="Mejor / peor día"
              value={k!.bestDay ? fmtUsd(k!.bestDay.pnl) : '—'}
              sub={k!.worstDay ? `peor: ${fmtUsd(k!.worstDay.pnl)} (${fmtDay(k!.worstDay.date)})` : undefined}
              valueClass={k!.bestDay ? pnlTone(k!.bestDay.pnl) : undefined}
            />
          </section>

          {/* Curva de equity */}
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Curva de equity (PnL acumulado)</h3>
            <EquityCurve series={data.series} />
          </section>

          {/* Heatmap */}
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">PnL por día</h3>
            <PnlHeatmap series={data.series} from={data.from} to={data.to} />
          </section>

          {/* Tablas */}
          <section className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              <h3 className="border-b border-gray-800 px-4 py-3 text-sm font-semibold text-white">Por símbolo</h3>
              {data.bySymbol.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">Sin órdenes ejecutadas en el período</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Símbolo</th>
                      <th className="px-4 py-2 text-right">Trades</th>
                      <th className="px-4 py-2 text-right">W</th>
                      <th className="px-4 py-2 text-right">L</th>
                      <th className="px-4 py-2 text-right">Win rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/70">
                    {data.bySymbol.map(row => (
                      <tr key={row.symbol}>
                        <td className="px-4 py-2 font-mono font-semibold text-gray-100">{row.symbol}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-300">{row.trades}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-green-400">{row.wins}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-400">{row.losses}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-300">
                          {row.winRate != null ? `${row.winRate}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
              <h3 className="border-b border-gray-800 px-4 py-3 text-sm font-semibold text-white">Por cuenta</h3>
              {data.byAccount.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">Sin actividad en el período</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Cuenta</th>
                      <th className="px-4 py-2 text-right">PnL</th>
                      <th className="px-4 py-2 text-right">Trades</th>
                      <th className="px-4 py-2 text-right">Win rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/70">
                    {data.byAccount.map(row => (
                      <tr key={row.accountId}>
                        <td className="px-4 py-2 text-gray-100">{row.accountName}</td>
                        <td className={`px-4 py-2 text-right font-mono tabular-nums ${pnlTone(row.pnl)}`}>{fmtUsd(row.pnl)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-300">{row.trades}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-300">
                          {row.winRate != null ? `${row.winRate}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
