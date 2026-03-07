import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getOAuthAuthorizeUrl, exchangeCodeForToken } from '../integrations/broker/tradovate/auth';

export const authRouter = Router();

// POST /register
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email y password son requeridos' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ success: false, error: 'El email ya está registrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    });

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, webhookToken: user.webhookToken },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email y password son requeridos' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ success: false, error: 'Credenciales inválidas' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, error: 'Cuenta desactivada' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Credenciales inválidas' });
      return;
    }

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, webhookToken: user.webhookToken },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /refresh
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'Refresh token requerido' });
      return;
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!
    ) as { userId: string; role: string };

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'Usuario no encontrado o desactivado' });
      return;
    }

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );

    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, error: 'Refresh token inválido' });
  }
});

// GET /tradovate/connect — requires auth
authRouter.get('/tradovate/connect', authMiddleware, (req: AuthRequest, res: Response) => {
  const url = getOAuthAuthorizeUrl();
  res.redirect(url);
});

// GET /tradovate/callback — OAuth callback
authRouter.get('/tradovate/callback', async (req: Request, res: Response) => {
  try {
    const { code, accountId } = req.query;
    if (!code) {
      res.status(400).json({ success: false, error: 'Authorization code requerido' });
      return;
    }

    const tokens = await exchangeCodeForToken(code as string);

    if (accountId) {
      const tokenExpiry = new Date(Date.now() + tokens.expiresIn * 1000);
      await prisma.account.update({
        where: { id: accountId as string },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry,
        },
      });
    }

    // Redirect to frontend with success
    res.redirect('/accounts?oauth=success');
  } catch (error: any) {
    res.redirect(`/accounts?oauth=error&message=${encodeURIComponent(error.message)}`);
  }
});
