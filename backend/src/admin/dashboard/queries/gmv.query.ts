import { OrderStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * GMV = sum of `totalInCents` of checkout orders that reached a
 * successfully-paid terminal state (PAID, SHIPPED, DELIVERED) whose
 * `paidAt` timestamp falls inside the requested range.
 *
 * Returns zero on empty-state. Never null, never throws on empty.
 */
export async function queryGmvInCents(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<{ gmvInCents: number; approvedCount: number }> {
  const result = await prisma.checkoutOrder.aggregate({
    where: {
      status: { in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
      paidAt: { gte: from, lte: to },
    },
    _sum: { totalInCents: true },
    _count: { _all: true },
  });
  return {
    gmvInCents: Number(result._sum.totalInCents ?? 0),
    approvedCount: result._count._all,
  };
}
