import { useEffect, useRef } from 'react'

// Map our timeframe strings to TradingView intervals
function tvInterval(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1', '2m': '2', '3m': '3', '5m': '5', '10m': '10',
    '15m': '15', '30m': '30', '1h': '60', '2h': '120',
    '4h': '240', 'Daily': 'D', 'Weekly': 'W',
  }
  return map[tf] ?? '60'
}

// Deduplicate TV script loading across multiple widget instances
const tvState = { loaded: false, loading: false, cbs: [] as (() => void)[] }

function loadTVScript(cb: () => void) {
  if (tvState.loaded || (window as any).TradingView) {
    cb()
    return
  }
  tvState.cbs.push(cb)
  if (tvState.loading) return
  tvState.loading = true
  const s = document.createElement('script')
  s.src = 'https://s3.tradingview.com/tv.js'
  s.async = true
  s.onload = () => {
    tvState.loaded = true
    tvState.cbs.forEach(fn => fn())
    tvState.cbs.length = 0
  }
  document.head.appendChild(s)
}

// Stable unique IDs per component instance
let widgetSeq = 0

interface Props {
  symbol?: string
  interval?: string
  height?: number | string
}

// NOTA: los contratos continuos de futuros (MNQ1!, NQ1!) están bloqueados en
// los widgets gratuitos — usar índices/CFDs equivalentes (CAPITALCOM:US100, etc.)
export default function TradingViewWidget({
  symbol = 'CAPITALCOM:US100',
  interval = '1h',
  height = 380,
}: Props) {
  const idRef = useRef(`tv_w_${++widgetSeq}`)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''
    let active = true

    loadTVScript(() => {
      if (!active || !containerRef.current) return
      containerRef.current.innerHTML = ''
      try {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol,
          interval: tvInterval(interval),
          timezone: 'America/Chicago',
          theme: 'dark',
          style: '1',
          locale: 'es',
          toolbar_bg: '#131722',
          enable_publishing: false,
          hide_side_toolbar: false,
          hide_volume: true,
          allow_symbol_change: true,
          container_id: idRef.current,
        })
      } catch { /* ignore widget init errors */ }
    })

    return () => {
      active = false
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [symbol, interval])

  return (
    <div
      ref={containerRef}
      id={idRef.current}
      style={{ height }}
      className="w-full"
    />
  )
}
