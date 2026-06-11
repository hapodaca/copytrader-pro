import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { routeSignal } from '../services/copyRouter'
import { captureChartForSignal } from '../services/chartCapture'

const router = Router()

const ManualSignalSchema = z.object({
  groupId:  z.string().min(1),
  symbol:   z.string().min(1),
  action:   z.enum(['BUY', 'SELL', 'CLOSE_LONG', 'CLOSE_SHORT']),
  price:    z.number().positive().optional(),
  timeframe: z.string().optional(),
  sl:       z.number().positive().optional(), // stop loss price
  tp:       z.number().positive().optional(), // take profit price
})

router.post('/signal', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = ManualSignalSchema.parse(req.body)

    // Verificar que el grupo pertenece al usuario
    const group = await prisma.copyGroup.findFirst({
      where: { id: data.groupId, userId: req.user!.id, isActive: true },
    })
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' })

    // Número secuencial de envío por usuario
    const seqNumber = (await prisma.signal.count({ where: { userId: req.user!.id } })) + 1

    const signal = await prisma.signal.create({
      data: {
        userId: req.user!.id,
        source: 'manual',
        symbol: data.symbol,
        action: data.action,
        price: data.price ?? 0,
        timeframe: data.timeframe ?? null,
        sl: data.sl ?? null,
        tp: data.tp ?? null,
        rawPayload: req.body,
        status: 'received',
        seqNumber,
      },
    })

    res.status(200).json({ received: true, signalId: signal.id })

    // Capturar chart async (no bloquea)
    captureChartForSignal(signal.id, signal.symbol, signal.action, signal.price, signal.timeframe, signal.sl, signal.tp)
      .catch(() => {})

    // Procesar async con el groupId específico
    routeSignal(signal, data.groupId).catch((err) =>
      console.error(`Error señal manual ${signal.id}:`, err.message)
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issue = err.issues[0]
      return res.status(400).json({ error: issue?.message ?? 'Payload inválido' })
    }
    next(err)
  }
})

export default router
