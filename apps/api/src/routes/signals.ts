import { Prisma } from '@prisma/client'
import { Router, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { stripAccountTokens } from '../utils/sanitizeAccount'

// Directorio donde se guardan las imágenes subidas manualmente
const SCREENSHOTS_DIR = path.join(__dirname, '../../public/screenshots')

const router = Router()

type SignalSortField = 'createdAt' | 'symbol' | 'action' | 'price' | 'strategy' | 'status' | 'source'

const SIGNAL_SORT_FIELDS: SignalSortField[] = [
  'createdAt',
  'symbol',
  'action',
  'price',
  'strategy',
  'status',
  'source',
]

function parseDateBoundary(input: string | undefined, endOfDay: boolean): Date | undefined {
  if (!input) return undefined

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? new Date(`${input}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(input)

  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const query = req.query as Record<string, string>

    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
    const offset = Math.max(0, Number(query.offset) || 0)
    const status = query.status
    const source = query.source
    const symbol = query.symbol

    // Compatibilidad: soporta dateFrom/dateTo y from/to
    const from = query.dateFrom ?? query.from
    const to = query.dateTo ?? query.to

    const sortByRaw = query.sortBy
    const sortDirRaw = query.sortDir

    const sortBy: SignalSortField = SIGNAL_SORT_FIELDS.includes(sortByRaw as SignalSortField)
      ? (sortByRaw as SignalSortField)
      : 'createdAt'

    const sortDir: Prisma.SortOrder = sortDirRaw === 'asc' ? 'asc' : 'desc'
    const orderBy = { [sortBy]: sortDir } as Prisma.SignalOrderByWithRelationInput

    const where: Prisma.SignalWhereInput = {
      userId: req.user!.id,
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(symbol ? { symbol: { contains: symbol.toUpperCase(), mode: 'insensitive' } } : {}),
    }

    const dateFrom = parseDateBoundary(from, false)
    const dateTo = parseDateBoundary(to, true)
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      }
    }

    const [signals, total] = await Promise.all([
      prisma.signal.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: { orders: { include: { account: true } } },
      }),
      prisma.signal.count({ where }),
    ])

    res.json({
      signals: signals.map((s) => ({
        ...s,
        orders: s.orders.map((o) => ({ ...o, account: stripAccountTokens(o.account) })),
      })),
      total,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const signal = await prisma.signal.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { orders: { include: { account: true } } },
    })

    if (!signal) return res.status(404).json({ error: 'Señal no encontrada' })
    res.json({
      ...signal,
      orders: signal.orders.map((o) => ({ ...o, account: stripAccountTokens(o.account) })),
    })
  } catch (err) {
    next(err)
  }
})

// ── PATCH /api/signals/:id/screenshot ─────────────────────────────────────────
// Adjunta una imagen a una señal: URL externa O base64 (PNG/JPG/GIF)
// Body opción A: { url: string }
// Body opción B: { imageData: "data:image/png;base64,...", mimeType: "image/png" }
router.patch('/:id/screenshot', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const signal = await prisma.signal.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    })
    if (!signal) return res.status(404).json({ error: 'Señal no encontrada' })

    let screenshotUrl: string

    if (req.body.clear === true) {
      // Opción 0: borrar screenshot
      await prisma.signal.update({ where: { id: req.params.id }, data: { screenshotUrl: null } })
      return res.json({ screenshotUrl: null })

    } else if (typeof req.body.url === 'string' && req.body.url.trim()) {
      // Opción A: URL externa — solo http(s) para evitar esquemas peligrosos (javascript:, data:, file:)
      screenshotUrl = req.body.url.trim()
      if (!/^https?:\/\//i.test(screenshotUrl)) {
        return res.status(400).json({ error: 'La URL debe ser http:// o https://' })
      }

    } else if (typeof req.body.imageData === 'string') {
      // Opción B: imagen base64
      const { imageData, mimeType } = req.body as { imageData: string; mimeType: string }

      const ALLOWED_MIME: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
      }
      const ext = ALLOWED_MIME[mimeType]
      if (!ext) return res.status(400).json({ error: 'Tipo de imagen no soportado (png/jpg/gif/webp)' })

      // ~6MB decodificados máximo
      if (imageData.length > 8_000_000) {
        return res.status(413).json({ error: 'Imagen demasiado grande (máx ~6MB)' })
      }

      const filename = `${req.params.id}-${Date.now()}.${ext}`

      // Crear carpeta si no existe
      await fs.promises.mkdir(SCREENSHOTS_DIR, { recursive: true })

      const base64 = imageData.replace(/^data:image\/\w+;base64,/, '')
      await fs.promises.writeFile(
        path.join(SCREENSHOTS_DIR, filename),
        Buffer.from(base64, 'base64'),
      )
      screenshotUrl = `/screenshots/${filename}`

    } else {
      return res.status(400).json({ error: 'Se requiere "url" o "imageData"' })
    }

    await prisma.signal.update({ where: { id: req.params.id }, data: { screenshotUrl } })
    return res.json({ screenshotUrl })
  } catch (err) {
    next(err)
  }
})

export default router
