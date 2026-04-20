import { OrderStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Producer counts shape. */
export interface ProducerCounts {
  /** Active last30 days property. */
  activeLast30Days: number;
  /** New in range property. */
  newInRange: number;
  /** Total property. */
  total: number;
}

/**
 * Producer metrics. "Active" means "has at least one paid order in the
 * rolling 30-day window ending at `to`" — this is the sales-heavy
 * definition from SP-3 spec (Q1). Pick the alternative definition later
 * if Daniel disagrees; that's deferred to SP-3b.
 *
 * "New in range" counts workspaces created inside the period.
 * "Total" is the full workspace count.
 */
export async function queryProducers(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<ProducerCounts> {
  const activeWindowFrom = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activeRows, newInRange, total] = await Promise.all([
    prisma.checkoutOrder.findMany({
      where: {
        status: { in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        paidAt: { gte: activeWindowFrom, lte: to },
      },
      distinct: ['workspaceId'],
      select: { workspaceId: true },
    }),
    prisma.workspace.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.workspace.count(),
  ]);

  return {
    activeLast30Days: activeRows.length,
    newInRange,
    total,
  };
}
