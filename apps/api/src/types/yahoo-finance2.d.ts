// Minimal type declarations for yahoo-finance2 (ESM package, needs moduleResolution:node16 for auto-resolve)
declare module 'yahoo-finance2' {
  interface ChartOptions {
    period1:   Date | string
    period2?:  Date | string
    interval?: '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1d' | '5d' | '1wk' | '1mo'
  }
  interface Quote {
    date:    Date | string
    open?:   number | null
    high?:   number | null
    low?:    number | null
    close?:  number | null
    volume?: number | null
  }
  interface ChartResult {
    meta?:   Record<string, unknown>
    quotes:  Quote[]
  }
  const yf: {
    chart(symbol: string, opts: ChartOptions): Promise<ChartResult>
    setGlobalConfig(cfg: Record<string, unknown>): void
  }
  export default yf
}
