import { Injectable, Logger } from '@nestjs/common';
import {
  PlatformLedgerKind,
  PlatformWalletBucket,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_CURRENCY = 'BRL';

export interface PlatformWalletBalance {
  currency: string;
  availableInCents: number;
  pendingInCents: number;
  reservedInCents: number;
  updatedAt: string;
}

export interface AppendLedgerInput {
  currency?: string;
  direction: 'credit' | 'debit';
  bucket: PlatformWalletBucket;
  amountInCents: bigint;
  kind: PlatformLedgerKind;
  orderId?: string | null;
  feeSnapshotId?: string | null;
  reason: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ListLedgerFilters {
  currency?: string;
  kind?: PlatformLedgerKind;
  from?: Date;
  to?: Date;
  skip?: number;
  take?: number;
}

/**
 * PlatformWalletService is the only authorised writer of the
 * PlatformWalletLedger. It mirrors the KloelWalletLedger pattern:
 * every balance mutation happens INSIDE a $transaction that also
 * appends the corresponding ledger row (I-ADMIN-W3). Read-only
 * consumers (controllers, reconciliation) use readBalance/listLedger.
 *
 * v0 scope: read balance, list ledger, append (used by the checkout
 * split engine in a follow-up PR). No payout queue, no reconcile
 * job — those land in SP-9 complete.
 */
@Injectable()
export class PlatformWalletService {
  private readonly logger = new Logger(PlatformWalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  async readBalance(currency: string = DEFAULT_CURRENCY): Promise<PlatformWalletBalance> {
    const wallet = await this.prisma.platformWallet.upsert({
      where: { currency },
      update: {},
      create: { currency },
    });
    return {
      currency: wallet.currency,
      availableInCents: Number(wallet.availableBalanceInCents),
      pendingInCents: Number(wallet.pendingBalanceInCents),
      reservedInCents: Number(wallet.reservedBalanceInCents),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  async listLedger(filters: ListLedgerFilters = {}): Promise<{
    items: Array<{
      id: string;
      currency: string;
      direction: string;
      bucket: PlatformWalletBucket;
      amountInCents: number;
      kind: PlatformLedgerKind;
      orderId: string | null;
      reason: string;
      createdAt: string;
    }>;
    total: number;
  }> {
    const where: Prisma.PlatformWalletLedgerWhereInput = {};
    if (filters.currency) where.currency = filters.currency;
    if (filters.kind) where.kind = filters.kind;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    const skip = Math.max(0, filters.skip ?? 0);
    const take = Math.min(200, Math.max(1, filters.take ?? 50));

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.platformWalletLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.platformWalletLedger.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        currency: r.currency,
        direction: r.direction,
        bucket: r.bucket,
        amountInCents: Number(r.amountInCents),
        kind: r.kind,
        orderId: r.orderId,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Append a ledger entry AND mutate the wallet balance in the same
   * atomic transaction (I-ADMIN-W3). Callers must pass a
   * transactional Prisma client or the service opens its own.
   */
  async append(input: AppendLedgerInput, tx?: Prisma.TransactionClient): Promise<void> {
    const currency = input.currency ?? DEFAULT_CURRENCY;

    const runOnce = async (client: Prisma.TransactionClient) => {
      await client.platformWallet.upsert({
        where: { currency },
        update: {},
        create: { currency },
      });
      await client.platformWalletLedger.create({
        data: {
          wallet: { connect: { currency } },
          currency,
          direction: input.direction,
          bucket: input.bucket,
          amountInCents: input.amountInCents,
          kind: input.kind,
          orderId: input.orderId ?? null,
          feeSnapshotId: input.feeSnapshotId ?? null,
          reason: input.reason,
          metadata: input.metadata,
        },
      });
      const delta = input.direction === 'credit' ? input.amountInCents : -input.amountInCents;
      const field =
        input.bucket === PlatformWalletBucket.AVAILABLE
          ? 'availableBalanceInCents'
          : input.bucket === PlatformWalletBucket.PENDING
            ? 'pendingBalanceInCents'
            : 'reservedBalanceInCents';
      await client.platformWallet.update({
        where: { currency },
        data: { [field]: { increment: delta } },
      });
    };

    if (tx) {
      await runOnce(tx);
    } else {
      const client = this.prisma as unknown as PrismaClient;
      await client.$transaction(async (inner) => runOnce(inner));
    }
  }
}
