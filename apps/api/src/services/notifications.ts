import nodemailer from 'nodemailer'
import { prisma } from '../db/client'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type NotifyEvent =
  | { type: 'signal_received'; symbol: string; action: string; price: number }
  | { type: 'order_filled';  symbol: string; side: string; qty: number; price?: number | null; accountName: string }
  | { type: 'order_skipped'; symbol: string; side: string; reason: string; accountName: string }
  | { type: 'order_error';   symbol: string; side: string; error: string; accountName: string }

export interface AccountResult {
  accountName: string
  reason?: string
}

export interface SignalBatchResult {
  enqueuedAccounts: AccountResult[]  // órdenes enviadas al broker/cola
  manualAccounts:   AccountResult[]  // órdenes en espera de confirmación manual
  skippedAccounts:  AccountResult[]  // saltadas (con motivo)
  errorAccounts:    AccountResult[]  // errores
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMessage(event: NotifyEvent): { subject: string; text: string } {
  switch (event.type) {
    case 'signal_received':
      return {
        subject: `📶 Señal recibida — ${event.action} ${event.symbol}`,
        text: `Nueva señal: ${event.action} ${event.symbol} @ ${event.price}`,
      }
    case 'order_filled':
      return {
        subject: `✅ Orden ejecutada — ${event.side} ${event.qty}x ${event.symbol}`,
        text: `Orden ejecutada en [${event.accountName}]: ${event.side} ${event.qty}x ${event.symbol}${event.price ? ` @ ${event.price}` : ''}`,
      }
    case 'order_skipped':
      return {
        subject: `⚠️ Orden saltada — ${event.symbol} (${event.reason})`,
        text: `Orden saltada en [${event.accountName}]: ${event.side} ${event.symbol}\nMotivo: ${event.reason}`,
      }
    case 'order_error':
      return {
        subject: `❌ Error en orden — ${event.symbol}`,
        text: `Error al ejecutar orden en [${event.accountName}]: ${event.side} ${event.symbol}\nError: ${event.error}`,
      }
  }
}

// ── Email ─────────────────────────────────────────────────────────────────────

// Transporter reutilizable — nodemailer mantiene pool de conexiones internamente
let _transporter: nodemailer.Transporter | null = null
function getTransporter(): nodemailer.Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null // no configurado
  return (_transporter ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  }))
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const { SMTP_USER, SMTP_FROM } = process.env
  const transporter = getTransporter()
  if (!transporter) return

  await transporter.sendMail({
    from: SMTP_FROM ?? SMTP_USER,
    to,
    subject,
    text,
  })
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return // no configurado

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('[Telegram] Error al enviar:', body)
    throw new Error(`Telegram API: ${body}`)
  }
}

// ── Notificación resumen de señal ─────────────────────────────────────────────
// Se llama UNA SOLA VEZ desde copyRouter después de procesar TODOS los followers.
// No usa debounce — el router ya tiene todos los resultados síncronamente.

export async function notifySignalResult(
  userId: string,
  symbol: string,
  action: string,
  result: SignalBatchResult,
): Promise<void> {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: userId } })
    if (!profile) return

    const { enqueuedAccounts, manualAccounts, skippedAccounts, errorAccounts } = result

    const hasEnqueued = enqueuedAccounts.length > 0 && profile.notifyOnFill
    const hasManual   = manualAccounts.length   > 0 && profile.notifyOnFill
    const hasSkips    = skippedAccounts.length  > 0 && profile.notifyOnSkip
    const hasErrors   = errorAccounts.length    > 0 && profile.notifyOnError

    if (!hasEnqueued && !hasManual && !hasSkips && !hasErrors) return

    // ── Asunto ──
    const parts: string[] = []
    if (hasEnqueued) parts.push(`✅ ${enqueuedAccounts.length} en firme`)
    if (hasManual)   parts.push(`📋 ${manualAccounts.length} manual`)
    if (hasSkips)    parts.push(`⚠️ ${skippedAccounts.length} saltada${skippedAccounts.length !== 1 ? 's' : ''}`)
    if (hasErrors)   parts.push(`❌ ${errorAccounts.length} error${errorAccounts.length !== 1 ? 'es' : ''}`)
    const subject = `${action} ${symbol} — ${parts.join(' · ')}`

    // ── Cuerpo ──
    const lines: string[] = [`Señal: ${action} ${symbol}`, '━━━━━━━━━━━━━━━━━━━━']

    if (hasEnqueued) {
      lines.push(`✅ Órdenes generadas en firme (${enqueuedAccounts.length}):`)
      enqueuedAccounts.forEach(a => lines.push(`  • ${a.accountName}`))
      lines.push('')
    }
    if (hasManual) {
      lines.push(`📋 Pendiente de confirmación manual (${manualAccounts.length}):`)
      manualAccounts.forEach(a => lines.push(`  • ${a.accountName}`))
      lines.push('')
    }
    if (hasSkips) {
      // Agrupa por motivo para mayor legibilidad
      const byReason = new Map<string, string[]>()
      skippedAccounts.forEach(a => {
        const r = a.reason ?? 'DESCONOCIDO'
        if (!byReason.has(r)) byReason.set(r, [])
        byReason.get(r)!.push(a.accountName)
      })
      lines.push(`⚠️ Saltadas (${skippedAccounts.length}):`)
      byReason.forEach((names, reason) => {
        lines.push(`  ${reason}:`)
        names.forEach(n => lines.push(`    • ${n}`))
      })
      lines.push('')
    }
    if (hasErrors) {
      lines.push(`❌ Errores (${errorAccounts.length}):`)
      errorAccounts.forEach(a => lines.push(`  • ${a.accountName}${a.reason ? `: ${a.reason}` : ''}`))
      lines.push('')
    }

    const text = lines.join('\n')
    const tasks: Promise<void>[] = []

    if (profile.notifyEmail) {
      tasks.push(sendEmail(profile.notifyEmail, subject, text).catch(err =>
        console.error('[Notify Email] Error:', err.message)
      ))
    }
    if (profile.telegramChatId) {
      const tgText = `*${action} ${symbol}*\n` +
        lines.map(l => l.replace(/━/g, '─')).join('\n')
      tasks.push(sendTelegram(profile.telegramChatId, tgText).catch(err =>
        console.error('[Notify Telegram] Error:', err.message)
      ))
    }

    await Promise.all(tasks)
  } catch (err: any) {
    console.error('[notifySignalResult] Error:', err.message)
  }
}

// ── Notificación de error en worker ───────────────────────────────────────────
// Se llama desde orderQueue cuando una orden falla definitivamente.

export async function notifyOrderError(
  userId: string,
  symbol: string,
  action: string,
  accountName: string,
  errorMsg: string,
): Promise<void> {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: userId } })
    if (!profile || !profile.notifyOnError) return

    const subject = `❌ Error en orden — ${action} ${symbol} [${accountName}]`
    const text = `Error al ejecutar orden:\n  Cuenta: ${accountName}\n  Símbolo: ${symbol}\n  Acción: ${action}\n  Error: ${errorMsg}`

    const tasks: Promise<void>[] = []
    if (profile.notifyEmail) {
      tasks.push(sendEmail(profile.notifyEmail, subject, text).catch(() => {}))
    }
    if (profile.telegramChatId) {
      tasks.push(sendTelegram(profile.telegramChatId, `*${subject}*\n${text}`).catch(() => {}))
    }
    await Promise.all(tasks)
  } catch (err: any) {
    console.error('[notifyOrderError] Error:', err.message)
  }
}

// ── Notificación de expiración de alerta TradingView ─────────────────────────

export async function notifyAlertExpiry(
  userId: string,
  alertName: string,
  symbol: string,
  expiresAt: string,
): Promise<void> {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: userId } })
    if (!profile) return

    const symbolPart = symbol ? ` (${symbol})` : ''
    const subject = `⏰ Alerta TradingView expirada — ${alertName}${symbolPart}`
    const text = [
      'Tu alerta de TradingView ha expirado.',
      '',
      '📋 Detalles:',
      `  Nombre: ${alertName}`,
      ...(symbol ? [`  Símbolo: ${symbol}`] : []),
      `  Fecha de expiración: ${expiresAt}`,
      '',
      '⚠️ Las señales ya NO se enviarán hasta que recrees la alerta.',
      '',
      'Para continuar operando, ve a TradingView → Alerts y crea nuevamente la alerta con tu webhook URL.',
    ].join('\n')

    const tasks: Promise<void>[] = []
    if (profile.notifyEmail) {
      tasks.push(sendEmail(profile.notifyEmail, subject, text).catch(err =>
        console.error('[AlertExpiry Email] Error:', err.message)
      ))
    }
    if (profile.telegramChatId) {
      const tgText = `⏰ *Alerta TradingView expirada*\n\n*${alertName}*${symbolPart}\nFecha: ${expiresAt}\n\n⚠️ Las señales ya NO se enviarán. Recrea la alerta en TradingView.`
      tasks.push(sendTelegram(profile.telegramChatId, tgText).catch(err =>
        console.error('[AlertExpiry Telegram] Error:', err.message)
      ))
    }
    await Promise.all(tasks)
  } catch (err: any) {
    console.error('[notifyAlertExpiry] Error:', err.message)
  }
}

// ── Servicio principal ────────────────────────────────────────────────────────

export class NotificationService {
  /** Notificación individual (para test y señal recibida) */
  static async notify(userId: string, event: NotifyEvent): Promise<void> {
    try {
      const profile = await prisma.profile.findUnique({ where: { id: userId } })
      if (!profile) return

      const wantsNotify =
        (event.type === 'signal_received' && profile.notifyOnSignal) ||
        (event.type === 'order_filled'    && profile.notifyOnFill)   ||
        (event.type === 'order_skipped'   && profile.notifyOnSkip)   ||
        (event.type === 'order_error'     && profile.notifyOnError)

      if (!wantsNotify) return

      const { subject, text } = buildMessage(event)
      const tasks: Promise<void>[] = []

      if (profile.notifyEmail) {
        tasks.push(sendEmail(profile.notifyEmail, subject, text).catch(err =>
          console.error('[Notify Email] Error:', err.message)
        ))
      }
      if (profile.telegramChatId) {
        tasks.push(sendTelegram(profile.telegramChatId, `*${subject}*\n${text}`).catch(err =>
          console.error('[Notify Telegram] Error:', err.message)
        ))
      }
      await Promise.all(tasks)
    } catch (err: any) {
      console.error('[NotificationService] Error:', err.message)
    }
  }

  static async sendTest(userId: string, channel: 'email' | 'telegram'): Promise<void> {
    const profile = await prisma.profile.findUnique({ where: { id: userId } })
    if (!profile) throw new Error('Usuario no encontrado')

    const subject = '🔔 CopyTrader Pro — Notificación de prueba'
    const text = 'Esta es una notificación de prueba. ¡Todo está funcionando correctamente!'

    if (channel === 'email' && profile.notifyEmail) {
      await sendEmail(profile.notifyEmail, subject, text)
    } else if (channel === 'telegram' && profile.telegramChatId) {
      await sendTelegram(profile.telegramChatId, `*${subject}*\n${text}`)
    }
  }
}
