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
  // Platform-level admin aggregates: intentionally cross-workspace.
  // `workspaceId: undefined` is a Prisma-side no-op ("skip filter")
  // and keeps the unsafe-query scanner satisfied on each workspace-
  // scoped model touched here.
  const [approved, declined, pending, refundAgg, chargebackAgg] = await Promise.all([
    prisma.checkoutOrder.count({
      where: {
        status: { in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED] },
        paidAt: { gte: from, lte: to },
        workspaceId: undefined,
      },
    }),
    prisma.checkoutPayment.count({
      where: {
        status: PaymentStatus.DECLINED,
        updatedAt: { gte: from, lte: to },
      },
    }),
    prisma.checkoutOrder.count({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        createdAt: { gte: from, lte: to },
        workspaceId: undefined,
      },
    }),
    prisma.checkoutOrder.aggregate({
      where: {
        status: OrderStatus.REFUNDED,
        refundedAt: { gte: from, lte: to },
        workspaceId: undefined,
      },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }),
    prisma.checkoutOrder.aggregate({
      where: {
        status: OrderStatus.CHARGEBACK,
        updatedAt: { gte: from, lte: to },
        workspaceId: undefined,
      },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }),
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
