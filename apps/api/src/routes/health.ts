import { Router } from 'express'
import { prisma } from '../db/client'

const router = Router()

router.get('/', async (_req, res) => {
  let dbOk = false
  try {
    await prisma.$queryRaw`SELECT 1`
    dbOk = true
  } catch {}

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
  })
})

export default router
