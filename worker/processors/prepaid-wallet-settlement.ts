import type { PrepaidWalletTransaction, Prisma } from '@prisma/client';
import { prisma } from '../db';

const USD_MICROS_SCALE = BigInt(1_000_000);
const TOKENS_PER_MILLION = BigInt(1_000_000);
const BASIS_POINTS_SCALE = BigInt(10_000);

type BigNumberish = bigint | number | string;

/** Serialized input token billing descriptor shape. */
export interface SerializedInputTokenBillingDescriptor {
  /** Model property. */
  model: string;
  /** Input usd micros per million property. */
  inputUsdMicrosPerMillion: string;
  /** Exchange rate brl cents per usd property. */
  exchangeRateBrlCentsPerUsd: string;
  /** Markup bps property. */
  markupBps: string;
}

type WorkerWalletTxLike = {
  prepaidWalletTransaction: {
    findFirst(args: unknown): Promise<PrepaidWalletTransaction | null>;
    create(args: unknown): Promise<PrepaidWalletTransaction>;
  };
  prepaidWallet: {
    findUnique(args: unknown): Promise<{
      id: string;
      workspaceId: string;
      balanceCents: bigint;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
};

type WorkerWalletPrismaLike = {
  $transaction<T>(fn: (tx: WorkerWalletTxLike) => Promise<T>): Promise<T>;
};

/** Worker wallet not found error. */
export class WorkerWalletNotFoundError extends Error {
  constructor(public readonly workspaceId: string) {
    super(`PrepaidWallet not found for workspace ${workspaceId}`);
    this.name = 'WorkerWalletNotFoundError';
  }
}

/** Worker insufficient wallet balance error. */
export class WorkerInsufficientWalletBalanceError extends Error {
  constructor(
    public readonly walletId: string,
    public readonly requestedCents: bigint,
    public readonly currentCents: bigint,
  ) {
    super(
      `Insufficient prepaid wallet balance on ${walletId}: requested ${requestedCents.toString()}, have ${currentCents.toString()}.`,
    );
    this.name = 'WorkerInsufficientWalletBalanceError';
  }
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - BigInt(1)) / denominator;
}

function normalizeInteger(value: BigNumberish, field: string): bigint {
  if (typeof value === 'bigint') {
    if (value < BigInt(0)) {
      throw new RangeError(`${field} must be >= 0`);
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${field} must be a non-negative safe integer`);
    }
    return BigInt(value);
  }

  if (!/^\d+$/.test(value)) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }

  return BigInt(value);
}

/** Quote serialized input token cost cents. */
export function quoteSerializedInputTokenCostCents(input: {
  inputTokens: BigNumberish;
  billing: SerializedInputTokenBillingDescriptor;
}): bigint {
  const inputTokens = normalizeInteger(input.inputTokens, 'inputTokens');
  const inputUsdMicrosPerMillion = normalizeInteger(
    input.billing.inputUsdMicrosPerMillion,
    'inputUsdMicrosPerMillion',
  );
  const exchangeRateBrlCentsPerUsd = normalizeInteger(
    input.billing.exchangeRateBrlCentsPerUsd,
    'exchangeRateBrlCentsPerUsd',
  );
  const markupBps = normalizeInteger(input.billing.markupBps, 'markupBps');

  return ceilDiv(
    inputTokens * inputUsdMicrosPerMillion * exchangeRateBrlCentsPerUsd * markupBps,
    TOKENS_PER_MILLION * USD_MICROS_SCALE * BASIS_POINTS_SCALE,
  );
}

/** Settle quoted usage charge. */
export async function settleQuotedUsageCharge(
  input: {
    workspaceId: string;
    operation: string;
    requestId: string;
    actualCostCents: bigint;
    reason: string;
    metadata?: Record<string, unknown>;
  },
  db: WorkerWalletPrismaLike = prisma as unknown as WorkerWalletPrismaLike,
): Promise<PrepaidWalletTransaction | null> {
  if (input.actualCostCents < BigInt(0)) {
    throw new RangeError(
      `settleQuotedUsageCharge: actualCostCents must be >= 0 (got ${input.actualCostCents.toString()})`,
    );
  }

  const usageReferenceType = `usage:${input.operation}`;
  const settlementReferenceType = `adjust:${usageReferenceType}`;

  return db.$transaction(async (tx) => {
    const existing = await tx.prepaidWalletTransaction.findFirst({
      where: {
        referenceType: settlementReferenceType,
        referenceId: input.requestId,
        type: 'ADJUSTMENT',
      },
    });
    if (existing) {
      return existing;
    }

    const originalUsage = await tx.prepaidWalletTransaction.findFirst({
      where: {
        referenceType: usageReferenceType,
        referenceId: input.requestId,
        type: 'USAGE',
      },
    });
    if (!originalUsage) {
      return null;
    }

    const wallet = await tx.prepaidWallet.findUnique({
      where: { id: originalUsage.walletId },
    });
    if (!wallet || wallet.workspaceId !== input.workspaceId) {
      throw new WorkerWalletNotFoundError(input.workspaceId);
    }

    const chargedCents =
      originalUsage.amountCents < BigInt(0)
        ? -originalUsage.amountCents
        : originalUsage.amountCents;
    const deltaCents = input.actualCostCents - chargedCents;
    if (deltaCents === BigInt(0)) {
      return null;
    }

    if (deltaCents > BigInt(0) && wallet.balanceCents < deltaCents) {
      throw new WorkerInsufficientWalletBalanceError(wallet.id, deltaCents, wallet.balanceCents);
    }

    const newBalance =
      deltaCents > BigInt(0) ? wallet.balanceCents - deltaCents : wallet.balanceCents + -deltaCents;
    await tx.prepaidWallet.update({
      where: { id: wallet.id },
      data: { balanceCents: newBalance },
    });

    return tx.prepaidWalletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'ADJUSTMENT',
        amountCents: -deltaCents,
        balanceAfterCents: newBalance,
        referenceType: settlementReferenceType,
        referenceId: input.requestId,
        metadata: {
          operation: input.operation,
          reason: input.reason,
          actualCostCents: input.actualCostCents.toString(),
          chargedCostCents: chargedCents.toString(),
          deltaCents: deltaCents.toString(),
          originalUsageTransactionId: originalUsage.id,
          ...(input.metadata ?? {}),
        } as Prisma.InputJsonValue,
      },
    });
  });
}
