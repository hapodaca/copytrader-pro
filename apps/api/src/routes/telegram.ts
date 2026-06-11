import { Router } from 'express'
import crypto from 'crypto'
import { prisma } from '../db/client'

const router = Router()

// Secret determinístico derivado del bot token. Se registra con setWebhook
// (secret_token) y Telegram lo reenvía en cada update — así nadie más puede
// inyectar updates falsos en este endpoint público.
export function telegramWebhookSecret(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 48)
}

// POST /api/telegram/webhook — Telegram envía updates aquí (sin auth, endpoint público)
router.post('/webhook', async (req, res) => {
  try {
    const secret = telegramWebhookSecret()
    if (secret && req.get('x-telegram-bot-api-secret-token') !== secret) {
      return res.status(403).json({ ok: false })
    }

    const update = req.body
    const msg = update.message
    if (!msg?.text) return res.json({ ok: true })

    const chatId  = String(msg.chat.id)
    const text: string = msg.text.trim()

    if (!text.startsWith('/start')) return res.json({ ok: true })

    const token = text.split(/\s+/)[1] // payload después de /start
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

    if (!token) {
      // /start sin payload — mensaje genérico
      if (BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '👋 Abre SyncTrade Pro → Configuración → Conectar Telegram.',
          }),
        }).catch(() => {})
      }
      return res.json({ ok: true })
    }

    // Buscar usuario por webhookToken
    const profile = await prisma.profile.findUnique({ where: { webhookToken: token } })
    if (!profile) return res.json({ ok: true })

    // Guardar chatId
    await prisma.profile.update({
      where: { id: profile.id },
      data: { telegramChatId: chatId },
    })
    console.log(`[Telegram] Conectado: user=${profile.id} chatId=${chatId}`)

    // Confirmación al usuario en Telegram
    if (BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ ¡Telegram conectado a SyncTrade Pro!\n\nRecibirás notificaciones aquí cuando:\n• Se ejecute una orden\n• Se salte una orden\n• Ocurra un error',
        }),
      }).catch(() => {})
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[Telegram webhook]', err)
    res.json({ ok: true }) // Siempre responder 200 a Telegram
  }
})

export default router
