import { OrderStatus, PaymentStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Transaction counts shape. */
export interface TransactionCounts {
  /** Approved property. */
  approved: number;
  /** Declined property. */
  declined: number;
  /** Pending property. */
  pending: number;
  /** Refund count property. */
  refundCount: number;
  /** Refund amount in cents property. */
  refundAmountInCents: number;
  /** Chargeback count property. */
  chargebackCount: number;
  /** Chargeback amount in cents property. */
  chargebackAmountInCents: number;
}

/**
 * Counts + monetary aggregates around transaction outcomes. Uses both
 * CheckoutOrder (for refund/chargeback amounts) and CheckoutPayment (for
 * the declined count, which is the authoritative signal of a card being
 * rejected — orders with refused payments usually stay in PENDING).
 */
export async function queryTransactionCounts(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<TransactionCounts> {
  const [approved, declined, pending, refundAgg, chargebackAgg] = await Promise.all([
    // @AdminGlobalOperation: approved transaction count, platform-wide
    prisma.checkoutOrder.count({
      where: {
        workspaceId: { not: '' },
        status: { in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        paidAt: { gte: from, lte: to },
      },
    }),
    prisma.checkoutPayment.count({
      where: {
        status: PaymentStatus.DECLINED,
        updatedAt: { gte: from, lte: to },
      },
    }),
    // @AdminGlobalOperation: pending transaction count, platform-wide
    prisma.checkoutOrder.count({
      where: {
        workspaceId: { not: '' },
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        createdAt: { gte: from, lte: to },
      },
    }),
    // @AdminGlobalOperation: refund aggregate, platform-wide
    prisma.checkoutOrder.aggregate({
      where: {
        workspaceId: { not: '' },
        status: OrderStatus.REFUNDED,
        refundedAt: { gte: from, lte: to },
      },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }) as Promise<{ _count: { _all: number }; _sum: { totalInCents: bigint | number | null } }>,
    // @AdminGlobalOperation: chargeback aggregate, platform-wide
    prisma.checkoutOrder.aggregate({
      where: {
        workspaceId: { not: '' },
        status: OrderStatus.CHARGEBACK,
        updatedAt: { gte: from, lte: to },
      },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }) as Promise<{ _count: { _all: number }; _sum: { totalInCents: bigint | number | null } }>,
  ]);

  return {
    approved,
    declined,
    pending,
    refundCount: refundAgg._count._all,
    refundAmountInCents: Number(refundAgg._sum.totalInCents ?? 0),
    chargebackCount: chargebackAgg._count._all,
    chargebackAmountInCents: Number(chargebackAgg._sum.totalInCents ?? 0),
  };
}
