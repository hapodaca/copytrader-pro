/**
 * chartCapture.ts
 *
 * Genera un PNG del gráfico de mercado al momento en que llega una señal.
 * No usa Playwright ni TradingView scraping — 100% libre de problemas de ToS.
 *
 * Stack:
 *  - Datos OHLCV  : yahoo-finance2 (contratos continuos, ej. NQ=F para MNQ)
 *  - Render       : @napi-rs/canvas (Node.js Canvas API, binarios precompilados Windows)
 *  - Storage      : Supabase Storage bucket "chart-screenshots" (URL pública permanente)
 *
 * NOTA para producción: yahoo-finance2 usa el endpoint público de Yahoo Finance
 * (sin API key). Para SaaS con muchos usuarios, considerar un proveedor de datos
 * con licencia comercial (Polygon.io, Alpaca, etc.).
 */

import { createClient } from '@supabase/supabase-js'
import { prisma } from '../db/client'

// ── Mapeo símbolo CME/Tradovate → contrato continuo Yahoo Finance ────────────
const ROOT_TO_YAHOO: Record<string, string> = {
  // Índices (micro + regular)
  MNQ: 'NQ=F',  NQ: 'NQ=F',   // Nasdaq-100 Micro / E-mini
  MES: 'ES=F',  ES: 'ES=F',   // S&P 500 Micro / E-mini
  MYM: 'YM=F',  YM: 'YM=F',   // Dow Jones Micro / E-mini
  M2K: 'RTY=F', RTY: 'RTY=F', // Russell 2000 Micro / E-mini
  // Energía
  MCL: 'CL=F',  CL: 'CL=F',   // Crude Oil Micro / WTI
  NG: 'NG=F',                  // Natural Gas
  // Metales
  MGC: 'GC=F',  GC: 'GC=F',   // Gold Micro / Gold
  SIL: 'SI=F',  SI: 'SI=F',   // Silver
  // Renta fija
  ZB: 'ZB=F',  ZN: 'ZN=F',  ZF: 'ZF=F',  ZT: 'ZT=F',
  // Agro
  ZC: 'ZC=F', ZS: 'ZS=F', ZW: 'ZW=F',
  HE: 'HE=F', LE: 'LE=F',
  // Crypto (bonus)
  BTC: 'BTC-USD', ETH: 'ETH-USD',
}

function toYahooSymbol(sym: string): string | null {
  // 'MNQU25' → root='MNQ', 'NQ1!' → root='NQ', 'MNQ!1' → root='MNQ'
  const clean = sym.replace(/[!1]+$/, '')
  // Eliminar sufijo de vencimiento: letra de mes + 1-4 dígitos de año
  const root = clean.replace(/[FGHJKMNQUVXZ]\d{1,4}$/, '') || clean
  return ROOT_TO_YAHOO[root] ?? ROOT_TO_YAHOO[clean] ?? null
}

// ── Parámetros por timeframe ─────────────────────────────────────────────────
type YahooInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1wk'

function tfConfig(tf: string | null): { interval: YahooInterval; lookbackMs: number } {
  const H = 3_600_000, D = 86_400_000
  switch (tf) {
    case '1m':     return { interval: '1m',  lookbackMs:  2 * H }
    case '2m':     return { interval: '2m',  lookbackMs:  4 * H }
    case '3m':     return { interval: '5m',  lookbackMs:  5 * H }
    case '5m':     return { interval: '5m',  lookbackMs:  8 * H }
    case '10m':    return { interval: '15m', lookbackMs: 12 * H }
    case '15m':    return { interval: '15m', lookbackMs: 24 * H }
    case '30m':    return { interval: '30m', lookbackMs:  2 * D }
    case '1h':     return { interval: '60m', lookbackMs:  4 * D }
    case '2h':     return { interval: '60m', lookbackMs:  7 * D }
    case '4h':     return { interval: '60m', lookbackMs: 12 * D }
    case 'Daily':  return { interval: '1d',  lookbackMs: 90 * D }
    case 'Weekly': return { interval: '1wk', lookbackMs: 365 * D }
    default:       return { interval: '5m',  lookbackMs:  8 * H }
  }
}

// ── Fetch OHLCV ──────────────────────────────────────────────────────────────
interface Bar { t: number; o: number; h: number; l: number; c: number }

async function fetchBars(yahooSymbol: string, tf: string | null): Promise<Bar[]> {
  // Lazy import para no penalizar startup si no se usa
  const yf = (await import('yahoo-finance2')).default
  // Suprimir warnings de validación de esquema
  yf.setGlobalConfig({ validation: { logErrors: false } })

  const cfg = tfConfig(tf)
  const result = await yf.chart(yahooSymbol, {
    period1:  new Date(Date.now() - cfg.lookbackMs),
    period2:  new Date(),
    interval: cfg.interval,
  })

  const bars: Bar[] = []
  for (const q of result.quotes ?? []) {
    if (q.open != null && q.high != null && q.low != null && q.close != null && q.close > 0) {
      const d = q.date instanceof Date ? q.date : new Date(q.date as string)
      bars.push({ t: d.getTime(), o: q.open, h: q.high, l: q.low, c: q.close })
    }
  }
  return bars.slice(-55) // últimas 55 velas
}

// ── Render del gráfico con @napi-rs/canvas ───────────────────────────────────
interface SigInfo {
  symbol:    string
  action:    string
  price:     number
  timeframe: string | null
  timestamp: Date
  sl?:       number | null
  tp?:       number | null
}

async function renderChart(bars: Bar[], sig: SigInfo): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas')

  // ── Dimensiones ──
  const W = 960, H = 500
  const HDR = 52                      // altura del header
  const ML = 72, MR = 14              // márgenes izq/der
  const MT = 12, MB = 28              // márgenes sup/inf del área de chart
  const CX = ML
  const CY = HDR + MT
  const CW = W - ML - MR              // ancho útil del chart
  const CH = H - HDR - MT - MB        // alto útil del chart

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // ── Fondo ──
  ctx.fillStyle = '#131722'
  ctx.fillRect(0, 0, W, H)

  // ── Header ──
  ctx.fillStyle = '#1a1e2d'
  ctx.fillRect(0, 0, W, HDR)
  ctx.strokeStyle = '#2a2e39'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, HDR); ctx.lineTo(W, HDR); ctx.stroke()

  const isBuy = ['BUY', 'CLOSE_SHORT'].includes(sig.action)

  // Símbolo
  ctx.font = 'bold 20px sans-serif'
  ctx.fillStyle = '#d1d4dc'
  ctx.fillText(sig.symbol, 14, 33)

  // Timeframe
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#555a6d'
  ctx.fillText(sig.timeframe ?? '—', 136, 33)

  // Badge de acción
  const badgeText = sig.action.replace(/_/g, ' ')
  ctx.font = 'bold 12px sans-serif'
  const bw = ctx.measureText(badgeText).width + 18
  const bx = 180
  ctx.fillStyle = isBuy ? 'rgba(38,166,154,0.25)' : 'rgba(239,83,80,0.25)'
  ctx.fillRect(bx, 16, bw, 22)
  ctx.fillStyle = isBuy ? '#26a69a' : '#ef5350'
  ctx.fillText(badgeText, bx + 9, 31)

  // Precio de entrada
  if (sig.price > 0) {
    const priceStr = sig.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    ctx.font = 'bold 16px sans-serif'
    ctx.fillStyle = isBuy ? '#26a69a' : '#ef5350'
    ctx.fillText(priceStr, bx + bw + 12, 33)
  }

  // Timestamp
  const ts = sig.timestamp.toLocaleString('es-MX', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#555a6d'
  const tsW = ctx.measureText(ts).width
  ctx.fillText(ts, W - MR - tsW - 4, 34)

  // ── Sin datos ──
  if (bars.length === 0) {
    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#555a6d'
    ctx.textAlign = 'center'
    ctx.fillText('Sin datos de mercado disponibles', W / 2, CY + CH / 2)
    ctx.textAlign = 'left'
    return canvas.toBuffer('image/png')
  }

  // ── Rango de precios ──
  const levels = [sig.price > 0 ? sig.price : null, sig.sl, sig.tp].filter(Boolean) as number[]
  let minP = Math.min(...bars.map(b => b.l), ...levels)
  let maxP = Math.max(...bars.map(b => b.h), ...levels)
  const pad = (maxP - minP) * 0.07
  minP -= pad; maxP += pad

  const toY = (p: number) => CY + CH - ((p - minP) / (maxP - minP)) * CH
  const toX = (i: number) => CX + (i + 0.5) * (CW / bars.length)

  // ── Grid horizontal ──
  const gridSteps = 6
  for (let i = 0; i <= gridSteps; i++) {
    const p = minP + ((maxP - minP) * i / gridSteps)
    const y = toY(p)
    ctx.strokeStyle = '#1e2231'
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(CX, y); ctx.lineTo(CX + CW, y); ctx.stroke()

    ctx.font = '10px "Courier New", monospace'
    ctx.fillStyle = '#4a5068'
    const lbl = p >= 10000 ? p.toFixed(0) : p >= 1000 ? p.toFixed(1) : p.toFixed(2)
    ctx.fillText(lbl, 2, y + 4)
  }

  // ── Velas ──
  const barW = CW / bars.length
  const bodyW = Math.max(2, barW * 0.65)

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    const x = toX(i)
    const isUp = b.c >= b.o
    const color = isUp ? '#26a69a' : '#ef5350'

    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([])

    // Mecha
    ctx.beginPath()
    ctx.moveTo(x, toY(b.h))
    ctx.lineTo(x, toY(b.l))
    ctx.stroke()

    // Cuerpo
    const top = toY(Math.max(b.o, b.c))
    const bot = toY(Math.min(b.o, b.c))
    const bh  = Math.max(1, bot - top)
    ctx.fillStyle = color
    ctx.fillRect(x - bodyW / 2, top, bodyW, bh)
  }

  // ── Líneas de precio ──
  const drawLine = (price: number, color: string, label: string, dashed: boolean) => {
    const y = toY(price)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.setLineDash(dashed ? [6, 4] : [])
    ctx.globalAlpha = 0.85
    ctx.beginPath(); ctx.moveTo(CX, y); ctx.lineTo(CX + CW, y); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    const priceStr = price >= 10000 ? price.toFixed(0) : price >= 1000 ? price.toFixed(1) : price.toFixed(2)
    const lbl = `${label} ${priceStr}`
    ctx.font = 'bold 10px "Courier New", monospace'
    const lblW = ctx.measureText(lbl).width + 8
    ctx.fillStyle = color
    ctx.globalAlpha = 0.9
    ctx.fillRect(CX + CW - lblW - 2, y - 11, lblW, 14)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#131722'
    ctx.fillText(lbl, CX + CW - lblW, y + 1)
  }

  if (sig.sl && sig.sl > 0) drawLine(sig.sl, '#ef5350', 'SL',    true)
  if (sig.tp && sig.tp > 0) drawLine(sig.tp, '#26a69a', 'TP',    true)
  if (sig.price > 0)        drawLine(sig.price, isBuy ? '#2196f3' : '#ff9800', 'ENTRY', false)

  // ── Borde del área ──
  ctx.strokeStyle = '#2a2e39'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.strokeRect(CX, CY, CW, CH)

  return canvas.toBuffer('image/png')
}

// ── Supabase Storage ─────────────────────────────────────────────────────────
const BUCKET = 'chart-screenshots'
let bucketReady = false

async function uploadToStorage(buffer: Buffer, filename: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const sb = createClient(url, key)

  // Crear bucket si no existe (solo lo intenta una vez)
  if (!bucketReady) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true })
    if (!error || error.message?.includes('already exists') || (error as any).statusCode === '409') {
      bucketReady = true
    } else {
      console.warn('[chartCapture] No se pudo crear el bucket:', error.message)
    }
  }

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: 'image/png', upsert: false })

  if (uploadErr) {
    console.warn('[chartCapture] Upload error:', uploadErr.message)
    return null
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(filename)
  return data.publicUrl
}

// ── Punto de entrada público ─────────────────────────────────────────────────
export async function captureChartForSignal(
  signalId: string,
  symbol:   string,
  action:   string,
  price:    number,
  timeframe: string | null,
  sl?: number | null,
  tp?: number | null,
): Promise<void> {
  try {
    const yahooSym = toYahooSymbol(symbol)

    let bars: Bar[] = []
    if (yahooSym) {
      bars = await fetchBars(yahooSym, timeframe).catch(err => {
        console.warn(`[chartCapture] No se pudo obtener OHLCV (${yahooSym}):`, err.message)
        return []
      })
    }

    // Si no hay datos OHLCV no subir — dejar screenshotUrl en null
    // para que el usuario pueda agregar manualmente su propia imagen
    if (bars.length === 0) {
      console.log(`[chartCapture] Sin datos OHLCV para ${symbol} — se omite captura automática`)
      return
    }

    const sig: SigInfo = { symbol, action, price, timeframe, timestamp: new Date(), sl, tp }
    const pngBuffer = await renderChart(bars, sig)

    const filename  = `${signalId}-${Date.now()}.png`
    const publicUrl = await uploadToStorage(pngBuffer, filename)

    if (publicUrl) {
      await prisma.signal.update({ where: { id: signalId }, data: { screenshotUrl: publicUrl } })
      console.log(`[chartCapture] Signal ${signalId.slice(0, 8)}… → ${publicUrl.slice(-40)}`)
    }
  } catch (err) {
    // No crítico — nunca debe romper el flujo principal
    console.warn(`[chartCapture] Error signal ${signalId}:`, (err as Error).message)
  }
}
