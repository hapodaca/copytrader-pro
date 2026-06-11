import { Request, Response, NextFunction } from 'express'

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Rate limiter en memoria por IP (ventana fija). Sin dependencias externas.
 * Suficiente para una instancia única; si se escala horizontal, migrar a Redis.
 */
export function rateLimit(options: { windowMs: number; max: number }) {
  const { windowMs, max } = options
  const buckets = new Map<string, Bucket>()

  // Limpieza periódica para no acumular IPs viejas
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }, windowMs)
  cleanup.unref()

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace('::ffff:', '')
    const now = Date.now()

    let bucket = buckets.get(ip)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(ip, bucket)
    }

    bucket.count++
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000))
      return res.status(429).json({ error: 'Demasiadas solicitudes — intenta de nuevo en unos segundos' })
    }

    next()
  }
}
