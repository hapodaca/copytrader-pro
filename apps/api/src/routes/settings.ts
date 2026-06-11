import { Router, Response, NextFunction } from 'express'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { NotificationService, notifyAlertExpiry } from '../services/notifications'

const router = Router()

// GET /api/settings/notifications
router.get('/notifications', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: req.profile!.id },
      select: {
        webhookToken:    true,
        notifyEmail:     true,
        telegramChatId:  true,
        notifyOnSignal:  true,
        notifyOnFill:    true,
        notifyOnSkip:    true,
        notifyOnError:   true,
      },
    })
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/settings/notifications
router.patch('/notifications', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { notifyEmail, notifyOnSignal, notifyOnFill, notifyOnSkip, notifyOnError } = req.body

    const updated = await prisma.profile.update({
      where: { id: req.profile!.id },
      data: {
        ...(notifyEmail      !== undefined && { notifyEmail:     notifyEmail     || null }),
        ...(notifyOnSignal   !== undefined && { notifyOnSignal }),
        ...(notifyOnFill     !== undefined && { notifyOnFill }),
        ...(notifyOnSkip     !== undefined && { notifyOnSkip }),
        ...(notifyOnError    !== undefined && { notifyOnError }),
      },
      select: {
        webhookToken:    true,
        notifyEmail:     true,
        telegramChatId:  true,
        notifyOnSignal:  true,
        notifyOnFill:    true,
        notifyOnSkip:    true,
        notifyOnError:   true,
      },
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/settings/telegram — desconectar Telegram
router.delete('/telegram', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.profile.update({
      where: { id: req.profile!.id },
      data: { telegramChatId: null },
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/settings/test-notification
router.post('/test-notification', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { channel } = req.body // 'email' | 'telegram'
    const profile = await prisma.profile.findUnique({
      where: { id: req.profile!.id },
      select: { notifyEmail: true, telegramChatId: true },
    })

    if (channel === 'email' && !profile?.notifyEmail) {
      return res.status(400).json({ error: 'No hay email configurado' })
    }
    if (channel === 'telegram' && !profile?.telegramChatId) {
      return res.status(400).json({ error: 'Telegram no está conectado' })
    }

    await NotificationService.sendTest(req.profile!.id, channel)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/settings/notify-alert-expiry — envía email/Telegram cuando una alerta de TV expira
router.post('/notify-alert-expiry', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { alertName, symbol, expiresAt } = req.body
    if (!alertName || !expiresAt) {
      return res.status(400).json({ error: 'alertName y expiresAt son requeridos' })
    }
    await notifyAlertExpiry(
      req.profile!.id,
      String(alertName),
      String(symbol ?? ''),
      String(expiresAt),
    )
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
