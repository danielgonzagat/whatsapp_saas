import { OrderStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Gmv daily point shape. */
export interface GmvDailyPoint {
  /** Date property. */
  date: string; // YYYY-MM-DD (UTC)
  /** Gmv in cents property. */
  gmvInCents: number;
  /** Count property. */
  count: number;
}

/** Revenue daily point shape. */
export interface RevenueDailyPoint {
  /** Date property. */
  date: string; // YYYY-MM-DD (UTC)
  /** Revenue in cents property. */
  revenueInCents: number;
  /** Count property. */
  count: number;
}

/**
 * Daily GMV series for the line chart. Uses a raw SQL `date_trunc('day')`
 * aggregation because Prisma's groupBy doesn't support truncation natively.
 *
 * Returns one row per day that had at least one paid order. Days with zero
 * activity are elided — the frontend fills gaps with zeros before
 * rendering so the chart has a continuous x-axis.
 */
export async function queryGmvDailySeries(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<GmvDailyPoint[]> {
  type Row = { day: Date; gmv: bigint | number | null; count: bigint | number };
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      date_trunc('day', "paidAt") AS day,
      SUM("totalInCents")::bigint AS gmv,
      COUNT(*)::bigint AS count
    FROM "CheckoutOrder"
    WHERE "status" = ANY (${[
      OrderStatus.PAID,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ]}::"OrderStatus"[])
      AND "paidAt" BETWEEN ${from} AND ${to}
    GROUP BY day
    ORDER BY day ASC
  `);

  return rows.map((row) => ({
    date: new Date(row.day).toISOString().slice(0, 10),
    gmvInCents: Number(row.gmv ?? 0),
    count: Number(row.count ?? 0),
  }));
}

/** Query revenue kloel daily series. */
export async function queryRevenueKloelDailySeries(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<RevenueDailyPoint[]> {
  type Row = { day: Date; revenue: bigint | number | null; count: bigint | number };
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      date_trunc('day', "created_at") AS day,
      COALESCE(
        SUM(
          CASE
            WHEN "direction" = 'credit' THEN "amount_in_cents"
            ELSE -"amount_in_cents"
          END
        ),
        0
      )::bigint AS revenue,
      COUNT(*)::bigint AS count
    FROM "marketplace_treasury_ledger"
    WHERE "kind" IN (
      'MARKETPLACE_FEE_CREDIT',
      'REFUND_DEBIT',
      'CHARGEBACK_DEBIT',
      'ADJUSTMENT_CREDIT',
      'ADJUSTMENT_DEBIT'
    )
      AND "created_at" BETWEEN ${from} AND ${to}
    GROUP BY day
    ORDER BY day ASC
  `);

  return rows.map((row) => ({
    date: new Date(row.day).toISOString().slice(0, 10),
    revenueInCents: Number(row.revenue ?? 0),
    count: Number(row.count ?? 0),
  }));
}
