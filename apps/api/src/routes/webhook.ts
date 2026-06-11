import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../db/client'
import { redis } from '../services/orderQueue'
import { validateWebhookPayload } from '../services/signalValidator'
import { routeSignal } from '../services/copyRouter'
import { captureChartForSignal } from '../services/chartCapture'

const router = Router()

const TV_ALLOWED_IPS = (process.env.TV_ALLOWED_IPS ?? '').split(',').map((ip) => ip.trim())
const WEBHOOK_DIAGNOSTIC =
  process.env.WEBHOOK_DIAGNOSTIC === '1' ||
  process.env.WEBHOOK_DIAGNOSTIC === 'true'

function maskToken(token: string): string {
  if (!token) return 'none'
  if (token.length <= 8) return `${token.slice(0, 2)}***`
  return `${token.slice(0, 4)}***${token.slice(-4)}`
}

function diag(
  stage: string,
  requestId: string,
  token: string,
  details: Record<string, unknown> = {}
) {
  if (!WEBHOOK_DIAGNOSTIC) return
  const payload = {
    requestId,
    token: maskToken(token),
    ...details,
  }
  console.log(`[WEBHOOK_DIAG][${stage}]`, JSON.stringify(payload))
}

router.post('/:webhookToken', async (req: Request, res: Response, next: NextFunction) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const webhookToken = req.params.webhookToken ?? ''
  const clientIp = (req.ip ?? req.socket.remoteAddress ?? '').replace('::ffff:', '')

  diag('incoming', requestId, webhookToken, {
    ip: clientIp,
    hasBody: !!req.body,
    symbol: req.body?.symbol ?? null,
    action: req.body?.action ?? null,
    timeframe: req.body?.timeframe ?? null,
    hasSecret: Boolean(req.body?.secret),
  })

  try {
    // 1. Buscar usuario por token
    const profile = await prisma.profile.findUnique({
      where: { webhookToken },
    })
    if (!profile) {
      diag('rejected_invalid_token', requestId, webhookToken, { ip: clientIp })
      return res.status(404).json({ error: 'Token inválido' })
    }
    if (!profile.isActive) {
      diag('rejected_inactive_profile', requestId, webhookToken, { userId: profile.id })
      return res.status(403).json({ error: 'Cuenta inactiva' })
    }

    // 2. IP whitelist TradingView (solo en producción)
    if (process.env.NODE_ENV === 'production' && TV_ALLOWED_IPS.length > 0) {
      if (!TV_ALLOWED_IPS.includes(clientIp)) {
        diag('rejected_ip_not_allowed', requestId, webhookToken, { userId: profile.id, ip: clientIp })
        return res.status(403).json({ error: 'IP no permitida' })
      }
    }

    // 3. Validar secret y schema
    // secret en body es opcional — el webhookToken en la URL ya autentica al usuario.
    // Si se manda secret, se valida; si no viene (ej: Pine Script), se omite el check.
    let payload: ReturnType<typeof validateWebhookPayload>
    try {
      payload = validateWebhookPayload(req.body)
      if (payload.secret && process.env.WEBHOOK_SECRET && payload.secret !== process.env.WEBHOOK_SECRET) {
        diag('rejected_secret_invalid', requestId, webhookToken, {
          userId: profile.id,
          symbol: payload.symbol,
          action: payload.action,
        })
        return res.status(401).json({ error: 'Secret inválido' })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payload inválido'
      diag('rejected_payload_invalid', requestId, webhookToken, {
        userId: profile.id,
        message,
      })
      return res.status(400).json({ error: message })
    }

    // 4. Deduplicación via Redis (mismo userId+symbol+action en < 5 segundos)
    // SET NX EX: solo pone la clave si NO existe → primer llamador gana, el resto es duplicado
    const dedupKey = `wh:dedup:${profile.id}:${payload.symbol}:${payload.action}`
    let isDuplicate = false
    try {
      const setResult = await redis.set(dedupKey, '1', 'EX', 5, 'NX')
      isDuplicate = setResult === null  // null = la clave ya existía → duplicado
    } catch {
      // Redis no disponible → fallback: dejar pasar (mejor registrar de más que perder señales)
      isDuplicate = false
    }

    const baseSignalData = {
      userId: profile.id,
      source: 'tradingview',
      symbol: payload.symbol,
      action: payload.action,
      price: payload.price,
      contracts: payload.contracts,
      strategy: payload.strategy,
      timeframe: payload.timeframe,
      sl: payload.sl ?? payload.SL,
      tp: payload.tp ?? payload.TP,
      rawPayload: req.body,
    }

    if (isDuplicate) {
      const signal = await prisma.signal.create({
        data: { ...baseSignalData, status: 'rejected', rejectReason: 'DUPLICATE' },
      })
      console.log(`[WEBHOOK] ⚠️  DUPLICADO ignorado — ${payload.symbol} ${payload.action} (userId:${profile.id.slice(-6)})`)
      diag('accepted_duplicate', requestId, webhookToken, {
        userId: profile.id,
        signalId: signal.id,
        symbol: payload.symbol,
        action: payload.action,
      })
      return res.status(200).json({ received: true, signalId: signal.id, status: 'duplicate' })
    }

    // 5. Guardar señal y responder < 500ms
    const signal = await prisma.signal.create({
      data: { ...baseSignalData, status: 'received' },
    })

    console.log(`[WEBHOOK] ✅ Señal recibida — ${payload.symbol} ${payload.action}${payload.price ? ` @ ${payload.price}` : ''} | id:${signal.id.slice(-8)} | user:${profile.id.slice(-6)}`)

    diag('accepted_received', requestId, webhookToken, {
      userId: profile.id,
      signalId: signal.id,
      symbol: payload.symbol,
      action: payload.action,
      source: 'tradingview',
    })

    // Responder inmediatamente, procesar en background
    res.status(200).json({ received: true, signalId: signal.id })

    // 6. Capturar chart async (no bloquea — falla silencioso)
    captureChartForSignal(signal.id, signal.symbol, signal.action, signal.price, signal.timeframe, signal.sl, signal.tp)
      .catch(() => {})

    // 7. Enrutar señal async
    routeSignal(signal)
      .then(() => {
        diag('processed', requestId, webhookToken, {
          userId: profile.id,
          signalId: signal.id,
        })
      })
      .catch((err) => {
        diag('processing_error', requestId, webhookToken, {
          userId: profile.id,
          signalId: signal.id,
          message: err instanceof Error ? err.message : String(err),
        })
        console.error(`Error procesando señal ${signal.id}:`, err.message)
      })
  } catch (err) {
    diag('unhandled_error', requestId, webhookToken, {
      message: err instanceof Error ? err.message : String(err),
    })
    next(err)
  }
})

export default router
