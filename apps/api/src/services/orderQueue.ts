import { Queue, Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '../db/client'
import { BrokerRegistry } from '../integrations/broker/BrokerRegistry'
import { incrementDailyStat } from './scheduleFilter'
import { closePosition } from './positionCloser'
import { notifyOrderError } from './notifications'

export const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
}

// Cliente Redis compartido para operaciones genéricas (dedup, etc.)
export const redis = new Redis(redisConnection)
redis.on('error', (err) => {
  if (!err.message?.includes('ECONNREFUSED')) {
    console.error('[Redis] Error:', err.message)
  }
})

const connection = redisConnection

export const orderQueue = new Queue('orders', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
})

orderQueue.on('error', (err) => {
  console.error('[BullMQ Queue] Error de conexión Redis — modo fallback activo:', err.message)
})

export interface OrderJobData {
  orderId: string
  accountId: string
  signalId: string
  symbol: string
  action: string
  qty: number
  sl?: number | null
  tp?: number | null
  price?: number | null  // precio de la señal — fill simulado para paper
}

async function processOrderJob(data: OrderJobData): Promise<void> {
  const { orderId, accountId, symbol, action, qty, sl, tp, price } = data
  const isClose = action === 'CLOSE_LONG' || action === 'CLOSE_SHORT'

  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })

  // Usar el broker correcto según el tipo de cuenta (paper, tradovate, etc.)
  const broker = BrokerRegistry.get(account.brokerType)
  const result = await broker.placeOrder(account, { symbol, action, sl: sl ?? null, tp: tp ?? null }, qty)

  const isFilled = result.status === 'filled'
  // Precio de ejecución: el real del broker si lo reporta; si no, el de la señal
  const fillPrice = result.fillPrice ?? (price && price > 0 ? price : null)

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: isFilled ? 'filled' : 'sent',
      tradovateOrderId: result.orderId,
      ...(isFilled && fillPrice != null ? { fillPrice } : {}),
    },
  })

  if (isFilled && isClose) {
    // Cerrar la posición abierta: exitPrice/winLoss/closedAt + PnL en DailyStat
    await closePosition(accountId, symbol, action as 'CLOSE_LONG' | 'CLOSE_SHORT', fillPrice)
  }

  // Los cierres no cuentan como entradas del día
  if (!isClose) {
    await incrementDailyStat(accountId, 'entriesCount')
  }
}

async function markOrderAsError(data: OrderJobData, errorMessage: string): Promise<void> {
  try {
    await prisma.order.update({
      where: { id: data.orderId },
      data: { status: 'error', errorMsg: errorMessage },
    })

    const [signal, account] = await Promise.all([
      prisma.signal.findUnique({ where: { id: data.signalId } }),
      prisma.account.findUnique({ where: { id: data.accountId } }),
    ])

    if (signal && account) {
      notifyOrderError(signal.userId, data.symbol, data.action, account.name, errorMessage).catch(() => {})
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[OrderQueue] No se pudo marcar orden en error:', message)
  }
}

// Encola en Redis; si Redis está caído, ejecuta de forma directa para evitar 500s.
export async function enqueueOrder(data: OrderJobData): Promise<void> {
  try {
    await orderQueue.add('place-order', data)
  } catch (err) {
    const queueError = err instanceof Error ? err.message : String(err)
    console.error('[OrderQueue] Redis no disponible, ejecutando orden en modo directo:', queueError)

    try {
      await processOrderJob(data)
    } catch (directErr) {
      const directMessage = directErr instanceof Error ? directErr.message : String(directErr)
      await markOrderAsError(data, directMessage)
      throw directErr
    }
  }
}

export function startOrderWorker() {
  const worker = new Worker<OrderJobData>(
    'orders',
    async (job: Job<OrderJobData>) => {
      await processOrderJob(job.data)
    },
    { connection }
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3)
    if (isLastAttempt) {
      await markOrderAsError(job.data, err.message)
    }
  })

  worker.on('error', (err) => console.error('[BullMQ Worker] Error:', err.message))

  return worker
}
