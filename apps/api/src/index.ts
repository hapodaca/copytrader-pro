import express from 'express';
import cors from 'cors';
import prisma from './db/client';
import { webhookRouter } from './routes/webhook';
import { authRouter } from './routes/auth';
import { accountsRouter } from './routes/accounts';
import { groupsRouter } from './routes/groups';
import { rulesRouter } from './routes/rules';
import { signalsRouter } from './routes/signals';
import { ordersRouter } from './routes/orders';
import { manualRouter } from './routes/manual';
import { adminRouter } from './routes/admin';
import { statsRouter } from './routes/stats';
import { healthRouter } from './routes/health';
import { reportsRouter } from './routes/reports';
import { auditRouter } from './routes/audit';
import { authMiddleware } from './middleware/auth';
import { initOrderQueue } from './services/orderQueue';
import bcrypt from 'bcryptjs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/webhook', webhookRouter);
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);

// Protected routes
app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/groups', authMiddleware, groupsRouter);
app.use('/api/rules', authMiddleware, rulesRouter);
app.use('/api/signals', authMiddleware, signalsRouter);
app.use('/api/orders', authMiddleware, ordersRouter);
app.use('/api/manual', authMiddleware, manualRouter);
app.use('/api/admin', authMiddleware, adminRouter);
app.use('/api/stats', authMiddleware, statsRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/audit', authMiddleware, auditRouter);

async function bootstrap() {
  // Initialize order queue worker
  initOrderQueue();

  // Seed admin user
  const adminExists = await prisma.user.findUnique({
    where: { email: 'admin@copytrader.local' },
  });
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin1234!', 12);
    await prisma.user.create({
      data: {
        email: 'admin@copytrader.local',
        passwordHash,
        name: 'Admin',
        role: 'admin',
      },
    });
    console.log('Admin user seeded: admin@copytrader.local / Admin1234!');
  }

  app.listen(PORT, () => {
    console.log(`CopyTrader Pro API running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
