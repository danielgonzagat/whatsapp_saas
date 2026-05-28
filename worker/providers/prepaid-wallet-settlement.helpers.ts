/**
 * Pure helpers extracted from `worker/providers/prepaid-wallet-settlement.ts`
 * so the BigInt arithmetic, validation predicates, and metadata builders can
 * be unit-tested without spinning up a Prisma client or transaction.
 *
 * IMPORTANT — Settlement remains atomic. The actual settlement transaction
 * (`settleQuotedUsageCharge` / `runSettlement`) deliberately stays in the
 * parent module because every step depends on the prior step's computed
 * values (quote → cost → charge → ledger). Only side-effect-free helpers
 * live here.
 *
 * Keep this module **free of side effects**: no `prisma`, no env reads, no
 * logger, no I/O. The whole point of co-locating the helpers in a sibling
 * file is to make them trivially testable in isolation.
 */
import type { Prisma, PrepaidWalletTransaction } from '@prisma/client';
import { WorkerInsufficientWalletBalanceError } from './prepaid-wallet-errors';

// ─── Numeric constants ─────────────────────────────────────────────────

/** BigInt zero used across the settlement arithmetic. */
export const ZERO_BIG = BigInt(0);

/** BigInt one used in `ceilDiv`. */
export const ONE_BIG = BigInt(1);

/** Scale factor for USD micros (1 USD == 1_000_000 micros). */
export const USD_MICROS_SCALE = BigInt(1_000_000);

/** Provider billing scale: rates are quoted per million tokens. */
export const TOKENS_PER_MILLION = BigInt(1_000_000);

/** Basis-points scale: 100% == 10_000 bps. */
export const BASIS_POINTS_SCALE = BigInt(10_000);

/** Plain `0` for non-BigInt comparisons. */
export const ZERO_NUM = 0;

/** Regex matching strings that consist solely of decimal digits. */
export const DECIMAL_DIGITS_RE = /^\d+$/;

// ─── Public types (re-exported by the parent module) ───────────────────

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

/** Input shape for {@link quoteSerializedInputTokenCostCents}. */
export interface IQuoteInput {
  /** Number of input tokens billed by the provider. */
  inputTokens: BigNumberish;
  /** Billing descriptor capturing model/FX/markup. */
  billing: ISerializedInputTokenBillingDescriptor;
}

/** Input shape for the settlement entrypoint. */
export interface ISettleInput {
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

// ─── Pure arithmetic helpers ───────────────────────────────────────────

/**
 * Compute `ceil(numerator / denominator)` for non-negative BigInt operands.
 *
 * @param numerator - Non-negative BigInt numerator.
 * @param denominator - Strictly positive BigInt denominator.
 * @returns Rounded-up quotient.
 */
export const ceilDiv = (numerator: bigint, denominator: bigint): bigint =>
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
export const normalizeInteger = (value: BigNumberish, field: string): bigint => {
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
 * Compute the unsigned cents that were originally charged to the wallet.
 *
 * USAGE rows are stored as negative deltas; this returns the magnitude.
 *
 * @param amountCents - Signed amount on the USAGE row.
 * @returns Absolute value of `amountCents`.
 */
export const absCents = (amountCents: bigint): bigint =>
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
export const computeNewBalance = (
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
export const buildAdjustmentMetadata = (
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

// ─── Prisma delegate contracts ─────────────────────────────────────────
// Kept here (not in the parent file) so the settlement transaction body can
// reference these types without re-declaring them inline. They describe the
// minimum Prisma surface the worker exercises — nothing more.

/** Subset of the Prisma `prepaidWalletTransaction` delegate used by the worker. */
export interface IPrepaidWalletTransactionDelegate {
  /** Find the first transaction matching the given criteria. */
  findFirst(args: unknown): Promise<PrepaidWalletTransaction | null>;
  /** Persist a new prepaid wallet transaction. */
  create(args: unknown): Promise<PrepaidWalletTransaction>;
}

/** Subset of the Prisma `prepaidWallet` delegate used by the worker. */
export interface IPrepaidWalletDelegate {
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
export interface IWorkerWalletTxLike {
  /** Prepaid wallet transaction delegate. */
  prepaidWalletTransaction: IPrepaidWalletTransactionDelegate;
  /** Prepaid wallet delegate. */
  prepaidWallet: IPrepaidWalletDelegate;
}

/** Minimal Prisma surface required to run an idempotent settlement. */
export interface IWorkerWalletPrismaLike {
  /** Run `fn` inside a serializable transaction. */
  $transaction<T>(fn: (tx: IWorkerWalletTxLike) => Promise<T>): Promise<T>;
}
