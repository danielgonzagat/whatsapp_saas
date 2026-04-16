import { OrderStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export interface GmvDailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  gmvInCents: number;
  count: number;
}

export interface RevenueDailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  revenueInCents: number;
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

export async function queryRevenueKloelDailySeries(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<RevenueDailyPoint[]> {
  type Row = { day: Date; revenue: bigint | number | null; count: bigint | number };
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      date_trunc('day', "created_at") AS day,
      SUM("amount_in_cents")::bigint AS revenue,
      COUNT(*)::bigint AS count
    FROM "platform_wallet_ledger"
    WHERE "kind" = 'PLATFORM_FEE_CREDIT'
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
