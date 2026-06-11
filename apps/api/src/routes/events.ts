import { Router, Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '../db/client'
import { addSSEClient, removeSSEClient } from '../services/sse'

const router = Router()

// Lazy-init Supabase client (same pattern as auth middleware)
let _supabase: ReturnType<typeof createClient> | null = null
function getSupabase() {
  return (_supabase ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ))
}

// GET /api/events/stream?token=<supabase-jwt>
// EventSource no soporta headers personalizados → token va en query param
router.get('/stream', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined

  if (!token) {
    res.status(401).json({ error: 'Token requerido' })
    return
  }

  try {
    const { data: { user }, error } = await getSupabase().auth.getUser(token)
    if (error || !user) {
      res.status(401).json({ error: 'Token inválido' })
      return
    }

    const profile = await prisma.profile.findUnique({ where: { id: user.id } })
    if (!profile || !profile.isActive) {
      res.status(403).json({ error: 'Cuenta desactivada' })
      return
    }

    // ── Configurar headers SSE ─────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // evitar buffering en nginx/proxy
    res.flushHeaders()

    // Registrar cliente para recibir eventos
    addSSEClient(user.id, res)

    // Heartbeat inicial de confirmación
    res.write(': connected\n\n')

    // Heartbeat periódico para mantener la conexión viva (evita que proxies la corten)
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': heartbeat\n\n')
      } catch {
        clearInterval(heartbeatTimer)
      }
    }, 30_000)

    // Limpiar al desconectar
    req.on('close', () => {
      clearInterval(heartbeatTimer)
      removeSSEClient(res)
    })

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error interno' })
    }
  }
})

export default router
