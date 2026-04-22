import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Query revenue kloel in cents. */
export async function queryRevenueKloelInCents(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<number> {
  type Row = { total: bigint | number | null };

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN "direction" = 'credit' THEN "amount_in_cents"
            ELSE -"amount_in_cents"
          END
        ),
        0
      )::bigint AS total
    FROM "marketplace_treasury_ledger"
    WHERE "kind" IN (
      'MARKETPLACE_FEE_CREDIT',
      'REFUND_DEBIT',
      'CHARGEBACK_DEBIT',
      'ADJUSTMENT_CREDIT',
      'ADJUSTMENT_DEBIT'
    )
      AND "created_at" BETWEEN ${from} AND ${to}
  `);

  return Number(rows[0]?.total ?? 0);
}
