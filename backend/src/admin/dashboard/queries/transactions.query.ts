import { OrderStatus, PaymentStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export interface TransactionCounts {
  approved: number;
  declined: number;
  pending: number;
  refundCount: number;
  refundAmountInCents: number;
  chargebackCount: number;
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
    prisma.checkoutOrder.count({
      where: {
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
    prisma.checkoutOrder.count({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        createdAt: { gte: from, lte: to },
      },
    }),
    prisma.checkoutOrder.aggregate({
      where: {
        status: OrderStatus.REFUNDED,
        refundedAt: { gte: from, lte: to },
      },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }),
    prisma.checkoutOrder.aggregate({
      where: {
        status: OrderStatus.CHARGEBACK,
        updatedAt: { gte: from, lte: to },
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
