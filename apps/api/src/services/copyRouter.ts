import prisma from '../db/client';
import { canTrade } from './scheduleFilter';
import { calculateQty } from './riskEngine';
import { enqueueOrder } from './orderQueue';

function mapActionToSide(action: string): string {
  switch (action) {
    case 'BUY': return 'Buy';
    case 'SELL': return 'Sell';
    case 'CLOSE_LONG': return 'Sell';
    case 'CLOSE_SHORT': return 'Buy';
    default: return action;
  }
}

interface SignalInput {
  id: string;
  symbol: string;
  action: string;
  price: number;
}

export async function processSignal(
  signal: SignalInput,
  userId: string,
  manualGroupId?: string
): Promise<void> {
  // Find active copy groups
  let groups;
  if (manualGroupId) {
    groups = await prisma.copyGroup.findMany({
      where: { id: manualGroupId, userId, isActive: true },
      include: {
        followers: {
          where: { isActive: true },
          include: { follower: { include: { tradingRules: true } } },
          orderBy: { lastOrderAt: 'asc' },
        },
      },
    });
  } else {
    // For webhook signals, find all groups owned by this user
    groups = await prisma.copyGroup.findMany({
      where: { userId, isActive: true },
      include: {
        followers: {
          where: { isActive: true },
          include: { follower: { include: { tradingRules: true } } },
          orderBy: { lastOrderAt: 'asc' },
        },
      },
    });
  }

  const side = mapActionToSide(signal.action);

  for (const group of groups) {
    const selectedFollowers = selectFollowers(group);

    for (const follower of selectedFollowers) {
      const rules = follower.follower.tradingRules;

      if (!rules) {
        // No rules configured — skip
        await prisma.order.create({
          data: {
            signalId: signal.id,
            accountId: follower.followerAccountId,
            symbol: signal.symbol,
            side,
            qty: 0,
            status: 'skipped',
            skipReason: 'SIN_REGLAS_CONFIGURADAS',
          },
        });
        continue;
      }

      // Schedule filter
      const tradeCheck = await canTrade(follower.followerAccountId, rules);
      if (!tradeCheck.allowed) {
        await prisma.order.create({
          data: {
            signalId: signal.id,
            accountId: follower.followerAccountId,
            symbol: signal.symbol,
            side,
            qty: 0,
            status: 'skipped',
            skipReason: tradeCheck.reason,
          },
        });
        continue;
      }

      // Risk engine — calculate qty
      const qty = await calculateQty(follower, signal, rules);

      if (qty === 0) {
        await prisma.order.create({
          data: {
            signalId: signal.id,
            accountId: follower.followerAccountId,
            symbol: signal.symbol,
            side,
            qty: 0,
            status: 'rejected',
            skipReason: 'SALDO_INSUFICIENTE',
          },
        });
        continue;
      }

      // Create order and enqueue
      const order = await prisma.order.create({
        data: {
          signalId: signal.id,
          accountId: follower.followerAccountId,
          symbol: signal.symbol,
          side,
          qty,
          status: 'pending',
        },
      });

      await enqueueOrder({
        orderId: order.id,
        signalId: signal.id,
        accountId: follower.followerAccountId,
        symbol: signal.symbol,
        side,
        qty,
      });

      // Update lastOrderAt for batch_rotate tracking
      await prisma.groupFollower.update({
        where: { id: follower.id },
        data: { lastOrderAt: new Date() },
      });
    }

    // Update rotate index if needed
    if (group.distributionMode === 'rotate') {
      const activeCount = group.followers.length;
      const nextIndex = activeCount > 0 ? (group.rotateIndex + 1) % activeCount : 0;
      await prisma.copyGroup.update({
        where: { id: group.id },
        data: { rotateIndex: nextIndex },
      });
    }
  }

  // Update signal status
  await prisma.signal.update({
    where: { id: signal.id },
    data: { status: 'processed' },
  });
}

function selectFollowers(group: {
  distributionMode: string;
  batchSize: number;
  rotateIndex: number;
  followers: any[];
}): any[] {
  const activeFollowers = group.followers;

  switch (group.distributionMode) {
    case 'all':
      return activeFollowers;

    case 'rotate': {
      if (activeFollowers.length === 0) return [];
      const index = group.rotateIndex % activeFollowers.length;
      return [activeFollowers[index]];
    }

    case 'batch_rotate': {
      // Select batchSize followers ordered by lastOrderAt ASC (oldest first)
      // Already sorted by lastOrderAt in the query
      return activeFollowers.slice(0, group.batchSize);
    }

    default:
      return activeFollowers;
  }
}
