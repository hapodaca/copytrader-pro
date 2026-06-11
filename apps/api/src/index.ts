import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'

// ── Evitar que errores no capturados maten el proceso ──────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL uncaughtException]', err.message)
  // No llamamos process.exit() — el servidor sigue corriendo
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL unhandledRejection]', reason)
  // No llamamos process.exit() — el servidor sigue corriendo
})

import webhookRouter from './routes/webhook'
import { telegramWebhookSecret } from './routes/telegram'
import { rateLimit } from './middleware/rateLimit'
import authRouter from './routes/auth'
import accountsRouter from './routes/accounts'
import groupsRouter from './routes/groups'
import rulesRouter from './routes/rules'
import signalsRouter from './routes/signals'
import ordersRouter from './routes/orders'
import manualRouter from './routes/manual'
import statsRouter from './routes/stats'
import adminRouter from './routes/admin'
import healthRouter from './routes/health'
import reportsRouter from './routes/reports'
import auditRouter from './routes/audit'
import settingsRouter from './routes/settings'
import telegramRouter from './routes/telegram'
import eventsRouter from './routes/events'

import { startOrderWorker } from './services/orderQueue'
import { TradovateAdapter } from './integrations/broker/tradovate/TradovateAdapter'
import { PaperBrokerAdapter } from './integrations/broker/paper/PaperBrokerAdapter'
import { BrokerRegistry } from './integrations/broker/BrokerRegistry'

const app = express()
const PORT = process.env.PORT ?? 3001

// Crear directorio de screenshots si no existe
const screenshotsDir = path.join(__dirname, '../public/screenshots')
fs.mkdirSync(screenshotsDir, { recursive: true })

// Middleware
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
app.use(cors({ origin: corsOrigins, credentials: true }))

// Headers de seguridad básicos (sin dependencia de helmet)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})

// 1MB para todo el API; 10MB solo para el upload de screenshots en base64
const jsonSmall = express.json({ limit: '1mb' })
const jsonLarge = express.json({ limit: '10mb' })
app.use((req, res, next) =>
  /^\/api\/signals\/[^/]+\/screenshot$/.test(req.path)
    ? jsonLarge(req, res, next)
    : jsonSmall(req, res, next)
)

// Servir imágenes de screenshots subidas manualmente
app.use('/screenshots', express.static(screenshotsDir))

// Registrar adaptadores de broker
BrokerRegistry.register(new TradovateAdapter())
BrokerRegistry.register(new PaperBrokerAdapter())

// Rutas públicas (sin JWT) — con rate limit por IP contra fuerza bruta del token
app.use('/api/webhook', rateLimit({ windowMs: 60_000, max: 120 }), webhookRouter)
app.use('/api/telegram', rateLimit({ windowMs: 60_000, max: 60 }), telegramRouter)
app.use('/api/health', healthRouter)
app.use('/api/events', eventsRouter)   // SSE — auth via ?token= query param

// Rutas auth
app.use('/api/auth', authRouter)

// Rutas protegidas (requieren JWT de Supabase)
app.use('/api/accounts', accountsRouter)
app.use('/api/accounts', rulesRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/signals', signalsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/manual', manualRouter)
app.use('/api/stats', statsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/audit', auditRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/admin', adminRouter)

// Global error handler — logs 500s to console
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Detectar errores de conexión a DB (Supabase/PgBouncer reset)
  const isDbConnError =
    err?.message?.includes('10054') ||
    err?.message?.includes('ConnectionReset') ||
    err?.message?.includes("Can't reach database") ||
    err?.code === 'P1001' || err?.code === 'P1002' || err?.code === 'P1008'

  if (isDbConnError) {
    console.warn('[DB] Conexión reseteada por Supabase (transitorio) — Prisma reconectando...')
    return res.status(503).json({ error: 'Database temporarily unavailable — please retry in a moment' })
  }

  console.error('[ERROR]', err.message, err.stack?.split('\n')[1]?.trim())
  // En producción no exponer detalles internos (paths, SQL, stack) al cliente
  const exposeDetails = process.env.NODE_ENV !== 'production'
  res.status(500).json({ error: exposeDetails ? (err.message ?? 'Internal Server Error') : 'Internal Server Error' })
})

// Registrar webhook de Telegram si API_URL está configurada
async function setupTelegramWebhook() {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const apiUrl = process.env.API_URL
  if (!token || !apiUrl) return
  const webhookUrl = `${apiUrl}/api/telegram/webhook`
  const res  = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: telegramWebhookSecret() }),
  })
  const data = await res.json() as { ok: boolean; description?: string }
  if (data.ok) console.log(`[Telegram] Webhook registrado → ${webhookUrl}`)
  else         console.warn(`[Telegram] Webhook error: ${data.description}`)
}
setupTelegramWebhook().catch(err => console.warn('[Telegram] Setup falló:', err.message))

// Iniciar worker de BullMQ
startOrderWorker()
console.log('BullMQ worker iniciado')

app.listen(PORT, () => {
  console.log(`CopyTrader Pro API corriendo en http://localhost:${PORT}`)
  console.log(`Webhook URL: http://localhost:${PORT}/api/webhook/:webhookToken`)
})
