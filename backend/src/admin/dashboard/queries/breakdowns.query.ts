import { OrderStatus, PaymentMethod } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Gateway breakdown row shape. */
export interface GatewayBreakdownRow {
  gateway: string;
  gmvInCents: number;
  count: number;
}

/** Method breakdown row shape. */
export interface MethodBreakdownRow {
  method: PaymentMethod;
  gmvInCents: number;
  count: number;
}

const PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

/**
 * Breakdown of GMV by payment gateway. Joins orders to payments so we can
 * group by `gateway` (which lives on CheckoutPayment).
 */
export async function queryGatewayBreakdown(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<GatewayBreakdownRow[]> {
  const orders = await prisma.checkoutOrder.findMany({
    where: {
      status: { in: PAID_STATUSES },
      paidAt: { gte: from, lte: to },
    },
    select: {
      totalInCents: true,
      payment: { select: { gateway: true } },
    },
  });

  const acc = new Map<string, { gmvInCents: number; count: number }>();
  for (const order of orders) {
    const gateway = order.payment?.gateway ?? 'unknown';
    const prev = acc.get(gateway) ?? { gmvInCents: 0, count: 0 };
    prev.gmvInCents += order.totalInCents;
    prev.count += 1;
    acc.set(gateway, prev);
  }

  return Array.from(acc.entries())
    .map(([gateway, v]) => ({ gateway, gmvInCents: v.gmvInCents, count: v.count }))
    .sort((a, b) => b.gmvInCents - a.gmvInCents);
}

/**
 * Breakdown of GMV by payment method (PIX / CREDIT_CARD / BOLETO).
 */
export async function queryMethodBreakdown(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<MethodBreakdownRow[]> {
  const grouped = await prisma.checkoutOrder.groupBy({
    by: ['paymentMethod'],
    where: {
      status: { in: PAID_STATUSES },
      paidAt: { gte: from, lte: to },
    },
    _sum: { totalInCents: true },
    _count: { _all: true },
  });

  return grouped
    .map((row) => ({
      method: row.paymentMethod,
      gmvInCents: Number(row._sum.totalInCents ?? 0),
      count: row._count._all,
    }))
    .sort((a, b) => b.gmvInCents - a.gmvInCents);
}
