import { Injectable, Logger } from '@nestjs/common';
import {
  MarketplaceTreasuryLedgerKind,
  MarketplaceTreasuryBucket,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceTreasuryInsufficientAvailableBalanceError } from './marketplace-treasury.errors';

const DEFAULT_CURRENCY = 'BRL';

/** Marketplace treasury balance shape. */
export interface MarketplaceTreasuryBalance {
  /** Currency property. */
  currency: string;
  /** Available in cents property. */
  availableInCents: number;
  /** Pending in cents property. */
  pendingInCents: number;
  /** Reserved in cents property. */
  reservedInCents: number;
  /** Updated at property. */
  updatedAt: string;
}

/** Append ledger input shape. */
export interface AppendLedgerInput {
  /** Currency property. */
  currency?: string;
  /** Direction property. */
  direction: 'credit' | 'debit';
  /** Bucket property. */
  bucket: MarketplaceTreasuryBucket;
  /** Amount in cents property. */
  amountInCents: bigint;
  /** Kind property. */
  kind: MarketplaceTreasuryLedgerKind;
  /** Order id property. */
  orderId?: string | null;
  /** Fee snapshot id property. */
  feeSnapshotId?: string | null;
  /** Reason property. */
  reason: string;
  /** Metadata property. */
  metadata?: Prisma.InputJsonValue;
}

/** List ledger filters shape. */
export interface ListLedgerFilters {
  /** Currency property. */
  currency?: string;
  /** Kind property. */
  kind?: MarketplaceTreasuryLedgerKind;
  /** From property. */
  from?: Date;
  /** To property. */
  to?: Date;
  /** Skip property. */
  skip?: number;
  /** Take property. */
  take?: number;
}

/** Debit marketplace treasury payout input shape. */
export interface DebitMarketplaceTreasuryPayoutInput {
  /** Currency property. */
  currency?: string;
  /** Amount in cents property. */
  amountInCents: bigint;
  /** Request id property. */
  requestId: string;
  /** Metadata property. */
  metadata?: Prisma.InputJsonValue;
}

/** Credit marketplace treasury adjustment input shape. */
export interface CreditMarketplaceTreasuryAdjustmentInput {
  /** Currency property. */
  currency?: string;
  /** Amount in cents property. */
  amountInCents: bigint;
  /** Request id property. */
  requestId: string;
  /** Reason property. */
  reason: string;
  /** Metadata property. */
  metadata?: Prisma.InputJsonValue;
}

/**
 * MarketplaceTreasuryService is the only authorised writer of the
 * MarketplaceTreasuryLedger. It mirrors the KloelWalletLedger pattern:
 * every balance mutation happens INSIDE a $transaction that also
 * appends the corresponding ledger row (I-ADMIN-W3). Read-only
 * consumers (controllers, reconciliation) use readBalance/listLedger.
 *
 * Current scope: read balance, list ledger, append-only mutations,
 * marketplace treasury payout debits, and idempotent adjustment credits used by
 * the marketplace treasury payout runtime. Reconciliation and maturation live in
 * sibling services under this module.
 */
@Injectable()
export class MarketplaceTreasuryService {
  private readonly logger = new Logger(MarketplaceTreasuryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Read balance. */
  async readBalance(currency: string = DEFAULT_CURRENCY): Promise<MarketplaceTreasuryBalance> {
    const wallet = await this.prisma.marketplaceTreasury.upsert({
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

  /** List ledger. */
  async listLedger(filters: ListLedgerFilters = {}): Promise<{
    items: Array<{
      id: string;
      currency: string;
      direction: string;
      bucket: MarketplaceTreasuryBucket;
      amountInCents: number;
      kind: MarketplaceTreasuryLedgerKind;
      orderId: string | null;
      reason: string;
      createdAt: string;
    }>;
    total: number;
  }> {
    const where: Prisma.MarketplaceTreasuryLedgerWhereInput = {};
    if (filters.currency) {
      where.currency = filters.currency;
    }
    if (filters.kind) {
      where.kind = filters.kind;
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        where.createdAt.gte = filters.from;
      }
      if (filters.to) {
        where.createdAt.lte = filters.to;
      }
    }

    const skip = Math.max(0, filters.skip ?? 0);
    const take = Math.min(200, Math.max(1, filters.take ?? 50));

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.marketplaceTreasuryLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.marketplaceTreasuryLedger.count({ where }),
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
      await client.marketplaceTreasury.upsert({
        where: { currency },
        update: {},
        create: { currency },
      });
      await client.marketplaceTreasuryLedger.create({
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
        input.bucket === MarketplaceTreasuryBucket.AVAILABLE
          ? 'availableBalanceInCents'
          : input.bucket === MarketplaceTreasuryBucket.PENDING
            ? 'pendingBalanceInCents'
            : 'reservedBalanceInCents';
      await client.marketplaceTreasury.update({
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

  /** Debit available for payout. */
  async debitAvailableForPayout(input: DebitMarketplaceTreasuryPayoutInput): Promise<void> {
    if (input.amountInCents <= 0n) {
      throw new RangeError(
        `debitAvailableForPayout: amountInCents must be > 0 (got ${input.amountInCents.toString()})`,
      );
    }

    const currency = input.currency ?? DEFAULT_CURRENCY;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.marketplaceTreasury.upsert({
        where: { currency },
        update: {},
        create: { currency },
      });

      const existing = await tx.marketplaceTreasuryLedger.findFirst({
        where: {
          currency,
          kind: MarketplaceTreasuryLedgerKind.PAYOUT_DEBIT,
          orderId: input.requestId,
        },
      });
      if (existing) {
        return;
      }

      if (wallet.availableBalanceInCents < input.amountInCents) {
        throw new MarketplaceTreasuryInsufficientAvailableBalanceError(
          currency,
          input.amountInCents,
          wallet.availableBalanceInCents,
        );
      }

      await tx.marketplaceTreasuryLedger.create({
        data: {
          walletId: wallet.id,
          currency,
          direction: 'debit',
          bucket: MarketplaceTreasuryBucket.AVAILABLE,
          amountInCents: input.amountInCents,
          kind: MarketplaceTreasuryLedgerKind.PAYOUT_DEBIT,
          orderId: input.requestId,
          reason: 'marketplace_treasury_payout_debit',
          metadata: input.metadata,
        },
      });

      await tx.marketplaceTreasury.update({
        where: { id: wallet.id },
        data: {
          availableBalanceInCents: { decrement: input.amountInCents },
        },
      });
    });
    this.logger.log({
      event: 'marketplace_treasury_payout_debit',
      currency,
      amountInCents: input.amountInCents.toString(),
      requestId: input.requestId,
    });
  }

  /** Credit available by adjustment. */
  async creditAvailableByAdjustment(
    input: CreditMarketplaceTreasuryAdjustmentInput,
  ): Promise<void> {
    if (input.amountInCents <= 0n) {
      throw new RangeError(
        `creditAvailableByAdjustment: amountInCents must be > 0 (got ${input.amountInCents.toString()})`,
      );
    }

    const currency = input.currency ?? DEFAULT_CURRENCY;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.marketplaceTreasury.upsert({
        where: { currency },
        update: {},
        create: { currency },
      });

      const existing = await tx.marketplaceTreasuryLedger.findFirst({
        where: {
          currency,
          kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
          orderId: input.requestId,
        },
      });
      if (existing) {
        return;
      }

      await tx.marketplaceTreasuryLedger.create({
        data: {
          walletId: wallet.id,
          currency,
          direction: 'credit',
          bucket: MarketplaceTreasuryBucket.AVAILABLE,
          amountInCents: input.amountInCents,
          kind: MarketplaceTreasuryLedgerKind.ADJUSTMENT_CREDIT,
          orderId: input.requestId,
          reason: input.reason,
          metadata: input.metadata,
        },
      });

      await tx.marketplaceTreasury.update({
        where: { id: wallet.id },
        data: {
          availableBalanceInCents: { increment: input.amountInCents },
        },
      });
    });
    this.logger.log({
      event: 'marketplace_treasury_adjustment_credit',
      currency,
      amountInCents: input.amountInCents.toString(),
      requestId: input.requestId,
      reason: input.reason,
    });
  }
}
