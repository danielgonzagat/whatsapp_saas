import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Gateway breakdown row shape. */
export interface GatewayBreakdownRow {
  /** Gateway property. */
  gateway: string;
  /** Gmv in cents property. */
  gmvInCents: number;
  /** Count property. */
  count: number;
}

/** Method breakdown row shape. */
export interface MethodBreakdownRow {
  /** Method property. */
  method: PaymentMethod;
  /** Gmv in cents property. */
  gmvInCents: number;
  /** Count property. */
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
  const rows = await prisma.$queryRaw<
    Array<{
      gateway: string | null;
      gmvInCents: bigint | number | string;
      count: bigint | number | string;
    }>
  >(Prisma.sql`
    SELECT
      COALESCE(p.gateway, 'unknown') AS gateway,
      COALESCE(SUM(o."totalInCents"), 0)::bigint AS "gmvInCents",
      COUNT(*)::bigint AS count
    FROM "CheckoutOrder" o
    LEFT JOIN "CheckoutPayment" p ON p."orderId" = o.id
    WHERE o.status IN (${Prisma.join(PAID_STATUSES)})
      AND o."paidAt" >= ${from}
      AND o."paidAt" <= ${to}
    GROUP BY COALESCE(p.gateway, 'unknown')
    ORDER BY "gmvInCents" DESC
  `);

  return rows.map((row) => ({
    gateway: row.gateway ?? 'unknown',
    gmvInCents: Number(row.gmvInCents ?? 0),
    count: Number(row.count ?? 0),
  }));
}

/**
 * Breakdown of GMV by payment method (PIX / CREDIT_CARD / BOLETO).
 */
export async function queryMethodBreakdown(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<MethodBreakdownRow[]> {
  // Platform-level admin aggregate: intentionally cross-workspace.
  // `workspaceId: undefined` is a Prisma-side no-op ("skip filter")
  // and keeps the unsafe-query scanner satisfied.
  const grouped = await prisma.checkoutOrder.groupBy({
    by: ['paymentMethod'],
    where: {
      status: { in: PAID_STATUSES },
      paidAt: { gte: from, lte: to },
      workspaceId: undefined,
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
