import Bull from 'bull';
import prisma from '../db/client';
import { BrokerRegistry } from '../integrations/broker/BrokerRegistry';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const orderQueue = new Bull('orders', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

export function initOrderQueue() {
  orderQueue.process(async (job) => {
    const { orderId, accountId, symbol, side, qty } = job.data;

    try {
      const account = await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
      });

      const broker = BrokerRegistry.get(account.brokerType);
      const result = await broker.placeOrder(
        account,
        { symbol, action: side, price: 0 },
        qty
      );

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'sent',
          tradovateOrderId: result.orderId,
        },
      });

      // Increment daily entries count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailyStat.upsert({
        where: { accountId_date: { accountId, date: today } },
        update: { entriesCount: { increment: 1 } },
        create: { accountId, date: today, entriesCount: 1 },
      });
    } catch (error: any) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'error',
          errorMsg: error.message || 'Unknown error',
          retryCount: { increment: 1 },
        },
      });
      throw error; // Re-throw for Bull retry
    }
  });

  orderQueue.on('failed', (job, err) => {
    console.error(`Order job ${job.id} failed:`, err.message);
  });

  console.log('Order queue worker initialized');
}

export async function enqueueOrder(data: {
  orderId: string;
  signalId: string;
  accountId: string;
  symbol: string;
  side: string;
  qty: number;
}) {
  await orderQueue.add(data);
}
