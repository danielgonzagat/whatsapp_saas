import type { Prisma, PrepaidWalletTransaction } from '@prisma/client';
import { prisma } from '../db';
import {
  WorkerInsufficientWalletBalanceError,
  WorkerWalletNotFoundError,
} from './prepaid-wallet-errors';

export {
  WorkerInsufficientWalletBalanceError,
  WorkerWalletNotFoundError,
} from './prepaid-wallet-errors';

const ZERO_BIG = BigInt(0);
const ONE_BIG = BigInt(1);
const USD_MICROS_SCALE = BigInt(1_000_000);
const TOKENS_PER_MILLION = BigInt(1_000_000);
const BASIS_POINTS_SCALE = BigInt(10_000);
const ZERO_NUM = 0;
const DECIMAL_DIGITS_RE = /^\d+$/;

/** Permissive integer-like value accepted by the cost quoter. */
export type BigNumberish = bigint | number | string;

/** Serialized billing descriptor used to quote token-based provider charges. */
export interface ISerializedInputTokenBillingDescriptor {
  /** Provider model identifier (e.g. `text-embedding-3-small`). */
  model: string;
  /** USD micros per million input tokens, encoded as decimal string. */
  inputUsdMicrosPerMillion: string;
  /** Exchange rate from USD to BRL cents, encoded as decimal string. */
  exchangeRateBrlCentsPerUsd: string;
  /** Markup applied on top of provider cost, in basis points (1bp = 0.01%). */
  markupBps: string;
}

/** Backwards-compatible alias kept for existing callers. */
export type SerializedInputTokenBillingDescriptor = ISerializedInputTokenBillingDescriptor;

/** Subset of the Prisma `prepaidWalletTransaction` delegate used by the worker. */
interface IPrepaidWalletTransactionDelegate {
  /** Find the first transaction matching the given criteria. */
  findFirst(args: unknown): Promise<PrepaidWalletTransaction | null>;
  /** Persist a new prepaid wallet transaction. */
  create(args: unknown): Promise<PrepaidWalletTransaction>;
}

/** Subset of the Prisma `prepaidWallet` delegate used by the worker. */
interface IPrepaidWalletDelegate {
  /** Find the first wallet matching the given criteria. */
  findFirst(args: unknown): Promise<{
    /** Wallet identifier. */
    id: string;
    /** Workspace identifier owning the wallet. */
    workspaceId: string;
    /** Current wallet balance in cents. */
    balanceCents: bigint;
  } | null>;
  /** Bulk update wallets matching the given criteria. */
  updateMany(args: unknown): Promise<unknown>;
}

/** Transaction client view exposed to the settlement callback. */
interface IWorkerWalletTxLike {
  /** Prepaid wallet transaction delegate. */
  prepaidWalletTransaction: IPrepaidWalletTransactionDelegate;
  /** Prepaid wallet delegate. */
  prepaidWallet: IPrepaidWalletDelegate;
}

/** Minimal Prisma surface required to run an idempotent settlement. */
interface IWorkerWalletPrismaLike {
  /** Run `fn` inside a serializable transaction. */
  $transaction<T>(fn: (tx: IWorkerWalletTxLike) => Promise<T>): Promise<T>;
}

/** Input shape for {@link quoteSerializedInputTokenCostCents}. */
interface IQuoteInput {
  /** Number of input tokens billed by the provider. */
  inputTokens: BigNumberish;
  /** Billing descriptor capturing model/FX/markup. */
  billing: ISerializedInputTokenBillingDescriptor;
}

/** Input shape for {@link settleQuotedUsageCharge}. */
interface ISettleInput {
  /** Workspace identifier whose wallet must be settled. */
  workspaceId: string;
  /** Operation tag (e.g. `kb_ingestion`). */
  operation: string;
  /** Idempotency key shared with the original USAGE transaction. */
  requestId: string;
  /** Actual provider cost in cents (>=0). */
  actualCostCents: bigint;
  /** Human-readable reason persisted on the adjustment metadata. */
  reason: string;
  /** Optional metadata merged into the adjustment record. */
  metadata?: Record<string, unknown>;
}

/**
 * Compute `ceil(numerator / denominator)` for non-negative BigInt operands.
 *
 * @param numerator - Non-negative BigInt numerator.
 * @param denominator - Strictly positive BigInt denominator.
 * @returns Rounded-up quotient.
 */
const ceilDiv = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - ONE_BIG) / denominator;

/**
 * Validate and coerce a {@link BigNumberish} into a non-negative BigInt.
 *
 * Rejects negative numbers, non-integer floats, and non-digit strings without
 * relying on a backtracking regex (matches digit-by-digit).
 *
 * @param value - Value to coerce.
 * @param field - Field name used in error messages.
 * @returns Non-negative BigInt representation.
 */
const normalizeInteger = (value: BigNumberish, field: string): bigint => {
  if (typeof value === 'bigint') {
    if (value < ZERO_BIG) {
      throw new RangeError(`${field} must be >= 0`);
    }

    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < ZERO_NUM) {
      throw new RangeError(`${field} must be a non-negative safe integer`);
    }

    return BigInt(value);
  }

  if (!DECIMAL_DIGITS_RE.test(value)) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }

  return BigInt(value);
};

/**
 * Quote the BRL-cents cost of a serialized input-token usage event.
 *
 * Combines provider rate, FX, and markup using BigInt arithmetic to avoid
 * floating-point drift. Inputs accept BigNumberish for ergonomic call sites.
 *
 * @param input - Token count and billing descriptor.
 * @returns Cost in BRL cents (BigInt).
 */
export const quoteSerializedInputTokenCostCents = (input: IQuoteInput): bigint => {
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
};

/**
 * Look up an existing settlement adjustment for the given idempotency key.
 *
 * @param tx - Active transaction client.
 * @param settlementReferenceType - Reference type tag for the adjustment.
 * @param requestId - Idempotency key.
 * @returns Existing adjustment row or `null`.
 */
const findExistingAdjustment = (
  tx: IWorkerWalletTxLike,
  settlementReferenceType: string,
  requestId: string,
): Promise<PrepaidWalletTransaction | null> =>
  tx.prepaidWalletTransaction.findFirst({
    where: {
      referenceType: settlementReferenceType,
      referenceId: requestId,
      type: 'ADJUSTMENT',
    },
  });

/**
 * Look up the original USAGE transaction the settlement adjusts.
 *
 * @param tx - Active transaction client.
 * @param usageReferenceType - Reference type tag for the original USAGE row.
 * @param requestId - Idempotency key shared with the original transaction.
 * @returns Original USAGE row or `null` if not found.
 */
const findOriginalUsage = (
  tx: IWorkerWalletTxLike,
  usageReferenceType: string,
  requestId: string,
): Promise<PrepaidWalletTransaction | null> =>
  tx.prepaidWalletTransaction.findFirst({
    where: {
      referenceType: usageReferenceType,
      referenceId: requestId,
      type: 'USAGE',
    },
  });

/**
 * Compute the unsigned cents that were originally charged to the wallet.
 *
 * USAGE rows are stored as negative deltas; this returns the magnitude.
 *
 * @param amountCents - Signed amount on the USAGE row.
 * @returns Absolute value of `amountCents`.
 */
const absCents = (amountCents: bigint): bigint =>
  amountCents < ZERO_BIG ? -amountCents : amountCents;

/**
 * Apply the wallet balance change implied by `deltaCents` and return the new
 * balance.
 *
 * `deltaCents > 0` means the actual provider cost exceeded the quote and the
 * wallet must be debited further. Negative deltas refund the wallet.
 *
 * @param wallet - Current wallet snapshot.
 * @param deltaCents - Signed delta to apply.
 * @returns New wallet balance.
 * @throws WorkerInsufficientWalletBalanceError when a positive delta exceeds
 *   the current balance.
 */
const computeNewBalance = (
  wallet: { id: string; balanceCents: bigint },
  deltaCents: bigint,
): bigint => {
  if (deltaCents > ZERO_BIG && wallet.balanceCents < deltaCents) {
    throw new WorkerInsufficientWalletBalanceError(wallet.id, deltaCents, wallet.balanceCents);
  }

  return deltaCents > ZERO_BIG
    ? wallet.balanceCents - deltaCents
    : wallet.balanceCents + -deltaCents;
};

/**
 * Build the JSON metadata persisted on a settlement adjustment row.
 *
 * @param input - Settlement input descriptor.
 * @param chargedCents - Magnitude of the original USAGE charge.
 * @param deltaCents - Signed difference between actual cost and original charge.
 * @param originalUsageId - Identifier of the original USAGE row.
 * @returns JSON-safe metadata payload.
 */
const buildAdjustmentMetadata = (
  input: ISettleInput,
  chargedCents: bigint,
  deltaCents: bigint,
  originalUsageId: string,
): Prisma.InputJsonValue =>
  ({
    operation: input.operation,
    reason: input.reason,
    actualCostCents: input.actualCostCents.toString(),
    chargedCostCents: chargedCents.toString(),
    deltaCents: deltaCents.toString(),
    originalUsageTransactionId: originalUsageId,
    ...(input.metadata ?? {}),
  }) as Prisma.InputJsonValue;

/**
 * Run the settlement body inside an active transaction.
 *
 * Idempotency: the caller's `requestId` is used both for adjustment lookup and
 * persistence. A repeat invocation with the same `requestId` returns the
 * existing adjustment and never applies a second balance change.
 *
 * @param tx - Active transaction client.
 * @param input - Settlement input descriptor.
 * @returns Persisted adjustment, the previously-persisted adjustment on
 *   replay, or `null` when no adjustment is necessary.
 */
const runSettlement = async (
  tx: IWorkerWalletTxLike,
  input: ISettleInput,
): Promise<PrepaidWalletTransaction | null> => {
  const usageReferenceType = `usage:${input.operation}`;
  const settlementReferenceType = `adjust:${usageReferenceType}`;

  const existing = await findExistingAdjustment(tx, settlementReferenceType, input.requestId);
  if (existing) {
    return existing;
  }

  const originalUsage = await findOriginalUsage(tx, usageReferenceType, input.requestId);
  if (!originalUsage) {
    return null;
  }

  const wallet = await tx.prepaidWallet.findFirst({
    where: { id: originalUsage.walletId, workspaceId: input.workspaceId },
  });
  if (!wallet) {
    throw new WorkerWalletNotFoundError(input.workspaceId);
  }

  const chargedCents = absCents(originalUsage.amountCents);
  const deltaCents = input.actualCostCents - chargedCents;
  if (deltaCents === ZERO_BIG) {
    return null;
  }

  const newBalance = computeNewBalance(wallet, deltaCents);

  await tx.prepaidWallet.updateMany({
    where: { id: wallet.id, workspaceId: input.workspaceId },
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
      metadata: buildAdjustmentMetadata(input, chargedCents, deltaCents, originalUsage.id),
    },
  });
};

/**
 * Settle a previously-quoted usage charge against a prepaid wallet.
 *
 * The function is idempotent on `(operation, requestId)`: the caller may
 * safely retry on transient failure (BullMQ retries, network errors) without
 * double-charging the wallet.
 *
 * @param input - Settlement input descriptor.
 * @param db - Optional Prisma-like client (defaults to the worker singleton).
 * @returns Persisted adjustment on first apply, the existing adjustment on
 *   replay, or `null` when no adjustment is necessary.
 */
export const settleQuotedUsageCharge = async (
  input: ISettleInput,
  db: IWorkerWalletPrismaLike = prisma as object as IWorkerWalletPrismaLike,
): Promise<PrepaidWalletTransaction | null> => {
  if (input.actualCostCents < ZERO_BIG) {
    throw new RangeError(
      `settleQuotedUsageCharge: actualCostCents must be >= 0 (got ${input.actualCostCents.toString()})`,
    );
  }

  return db.$transaction((tx) => runSettlement(tx, input));
};
