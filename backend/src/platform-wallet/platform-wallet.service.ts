import { Injectable } from '@nestjs/common';
import { PlatformLedgerKind, PlatformWalletBucket, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

export interface DebitPlatformPayoutInput {
  currency?: string;
  amountInCents: bigint;
  requestId: string;
  metadata?: Prisma.InputJsonValue;
}

export interface CreditPlatformAdjustmentInput {
  currency?: string;
  amountInCents: bigint;
  requestId: string;
  reason: string;
  metadata?: Prisma.InputJsonValue;
}

export class PlatformWalletInsufficientAvailableBalanceError extends Error {
  constructor(
    public readonly currency: string,
    public readonly attemptedAmountInCents: bigint,
    public readonly availableAmountInCents: bigint,
  ) {
    super(
      `platform wallet insufficient available balance for ${currency}: attempted=${attemptedAmountInCents.toString()} available=${availableAmountInCents.toString()}`,
    );
    this.name = 'PlatformWalletInsufficientAvailableBalanceError';
  }
}

/**
 * PlatformWalletService is the only authorised writer of the
 * PlatformWalletLedger. It mirrors the KloelWalletLedger pattern:
 * every balance mutation happens INSIDE a $transaction that also
 * appends the corresponding ledger row (I-ADMIN-W3). Read-only
 * consumers (controllers, reconciliation) use readBalance/listLedger.
 *
 * Current scope: read balance, list ledger, append-only mutations,
 * platform payout debits, and idempotent adjustment credits used by
 * the platform payout runtime. Reconciliation and maturation live in
 * sibling services under this module.
 */
@Injectable()
export class PlatformWalletService {
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
      // PrismaService extends PrismaClient so $transaction is on
      // the same instance — no cast needed.
      await this.prisma.$transaction(async (inner) => runOnce(inner));
    }
  }

  async debitAvailableForPayout(input: DebitPlatformPayoutInput): Promise<void> {
    if (input.amountInCents <= 0n) {
      throw new RangeError(
        `debitAvailableForPayout: amountInCents must be > 0 (got ${input.amountInCents.toString()})`,
      );
    }

    const currency = input.currency ?? DEFAULT_CURRENCY;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.platformWallet.upsert({
        where: { currency },
        update: {},
        create: { currency },
      });

      const existing = await tx.platformWalletLedger.findFirst({
        where: {
          currency,
          kind: PlatformLedgerKind.PAYOUT_DEBIT,
          orderId: input.requestId,
        },
      });
      if (existing) {
        return;
      }

      if (wallet.availableBalanceInCents < input.amountInCents) {
        throw new PlatformWalletInsufficientAvailableBalanceError(
          currency,
          input.amountInCents,
          wallet.availableBalanceInCents,
        );
      }

      await tx.platformWalletLedger.create({
        data: {
          walletId: wallet.id,
          currency,
          direction: 'debit',
          bucket: PlatformWalletBucket.AVAILABLE,
          amountInCents: input.amountInCents,
          kind: PlatformLedgerKind.PAYOUT_DEBIT,
          orderId: input.requestId,
          reason: 'platform_wallet_payout_debit',
          metadata: input.metadata,
        },
      });

      await tx.platformWallet.update({
        where: { id: wallet.id },
        data: {
          availableBalanceInCents: { decrement: input.amountInCents },
        },
      });
    });
  }

  async creditAvailableByAdjustment(input: CreditPlatformAdjustmentInput): Promise<void> {
    if (input.amountInCents <= 0n) {
      throw new RangeError(
        `creditAvailableByAdjustment: amountInCents must be > 0 (got ${input.amountInCents.toString()})`,
      );
    }

    const currency = input.currency ?? DEFAULT_CURRENCY;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.platformWallet.upsert({
        where: { currency },
        update: {},
        create: { currency },
      });

      const existing = await tx.platformWalletLedger.findFirst({
        where: {
          currency,
          kind: PlatformLedgerKind.ADJUSTMENT_CREDIT,
          orderId: input.requestId,
        },
      });
      if (existing) {
        return;
      }

      await tx.platformWalletLedger.create({
        data: {
          walletId: wallet.id,
          currency,
          direction: 'credit',
          bucket: PlatformWalletBucket.AVAILABLE,
          amountInCents: input.amountInCents,
          kind: PlatformLedgerKind.ADJUSTMENT_CREDIT,
          orderId: input.requestId,
          reason: input.reason,
          metadata: input.metadata,
        },
      });

      await tx.platformWallet.update({
        where: { id: wallet.id },
        data: {
          availableBalanceInCents: { increment: input.amountInCents },
        },
      });
    });
  }
}
