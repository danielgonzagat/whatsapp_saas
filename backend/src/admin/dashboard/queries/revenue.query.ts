import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export async function queryRevenueKloelInCents(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<number> {
  type Row = { total: bigint | number | null };

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      SUM("amount_in_cents")::bigint AS total
    FROM "platform_wallet_ledger"
    WHERE "kind" = 'PLATFORM_FEE_CREDIT'
      AND "created_at" BETWEEN ${from} AND ${to}
  `);

  return Number(rows[0]?.total ?? 0);
}
