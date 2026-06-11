import { Request, Response, NextFunction } from 'express'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { prisma } from '../db/client'

// Lazy-init: create client on first use so env vars are loaded by then
let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

export interface AuthRequest extends Request {
  user?: { id: string; email?: string }
  profile?: { id: string; role: string; webhookToken: string; isActive: boolean }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'Token requerido' })

    const { data: { user }, error } = await getSupabase().auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Token inválido' })

    // Auto-crear perfil si es la primera vez que el usuario hace una request
    let profile = await prisma.profile.findUnique({ where: { id: user.id } })
    if (!profile) {
      profile = await prisma.profile.create({
        data: { id: user.id, role: 'user' },
      })
    }

    if (!profile.isActive) return res.status(403).json({ error: 'Cuenta desactivada' })

    req.user = { id: user.id, email: user.email }
    req.profile = profile
    next()
  } catch (err) {
    next(err)
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol admin' })
  }
  next()
}
