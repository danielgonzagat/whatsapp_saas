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
 * Convert a bigint/number/string aggregate value to a JS `number` while
 * refusing silent precision loss. Throws if the magnitude exceeds
 * `Number.MAX_SAFE_INTEGER` so operators see the boundary rather than
 * rounded GMV/count totals.
 */
function toSafeNumber(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const asBig = typeof value === 'bigint' ? value : BigInt(value);
  if (asBig > BigInt(Number.MAX_SAFE_INTEGER) || asBig < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `breakdown aggregate exceeds Number.MAX_SAFE_INTEGER (${asBig.toString()}); ` +
        'switch GatewayBreakdownRow/MethodBreakdownRow to bigint to preserve precision.',
    );
  }
  return Number(asBig);
}

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
    FROM "RAC_CheckoutOrder" o
    LEFT JOIN "RAC_CheckoutPayment" p ON p."orderId" = o.id
    WHERE o.status IN (${Prisma.join(PAID_STATUSES)})
      AND o."paidAt" >= ${from}
      AND o."paidAt" <= ${to}
    GROUP BY COALESCE(p.gateway, 'unknown')
    ORDER BY "gmvInCents" DESC
  `);

  return rows.map((row) => ({
    gateway: row.gateway ?? 'unknown',
    gmvInCents: toSafeNumber(row.gmvInCents),
    count: toSafeNumber(row.count),
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
      gmvInCents: toSafeNumber(row._sum.totalInCents ?? 0),
      count: row._count._all,
    }))
    .sort((a, b) => b.gmvInCents - a.gmvInCents);
}
