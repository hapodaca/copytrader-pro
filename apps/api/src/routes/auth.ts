import { Router, Request, Response } from 'express'
import { prisma } from '../db/client'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { buildOAuthUrl, exchangeCodeForTokens } from '../integrations/broker/tradovate/auth'

const router = Router()

// Sync profile tras login de Supabase (auto-crea si no existe)
router.post('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json({ profile: req.profile })
})

// Obtener perfil actual
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json({ user: req.user, profile: req.profile })
})

// Iniciar OAuth Tradovate
router.get('/tradovate/connect', requireAuth, (_req: Request, res: Response) => {
  const url = buildOAuthUrl()
  res.redirect(url)
})

// Callback OAuth Tradovate
router.get('/tradovate/callback', requireAuth, async (req: AuthRequest, res: Response) => {
  const { code, error } = req.query as Record<string, string>
  if (error || !code) {
    return res.redirect(`${process.env.VITE_API_URL?.replace('3001', '3000')}/accounts?error=oauth_denied`)
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    // Guardar tokens en la primera cuenta del usuario que coincida con el tradovateId
    await prisma.account.updateMany({
      where: { userId: req.user!.id, tradovateId: String(tokens.userId) },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
    res.redirect(`${process.env.VITE_API_URL?.replace('3001', '3000')}/accounts?success=connected`)
  } catch (err) {
    console.error('Error OAuth Tradovate:', err)
    res.redirect(`${process.env.VITE_API_URL?.replace('3001', '3000')}/accounts?error=oauth_failed`)
  }
})

export default router
