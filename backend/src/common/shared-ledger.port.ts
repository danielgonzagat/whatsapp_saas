/**
 * SharedLedger port — the ONE append-only money-ledger contract.
 *
 * Money-ledgers migration family (Stage 3). Kloel has five parallel
 * money balance+ledger systems with near-identical hand-rolled
 * append/reconcile/mature logic and four divergent append signatures:
 *
 *   - Seller earnings    — `KloelWalletLedger`        (WalletLedgerService)
 *   - Usage prepaid      — `PrepaidWalletTransaction` (PrepaidWalletService)
 *   - Stripe Connect     — `ConnectLedgerEntry`       (LedgerService)  ← reference
 *   - House treasury     — `MarketplaceTreasuryLedger`(MarketplaceTreasuryService)
 *   - Receivable anticip.— `WalletAnticipation`
 *
 * This module defines the SUPERSET contract every per-actor writer can
 * satisfy, modeled on the strongest existing implementation — the Connect
 * `LedgerService` (`payments/ledger/ledger.service.ts`), which already
 * snapshots `balanceAfter` per bucket, is append-only, and is idempotent
 * on a reference key.
 *
 * IMPORTANT — this is a TYPE-LEVEL port plus PURE helpers only. It does NOT
 * merge any of the five tables, owns no Prisma client, and issues no I/O.
 * Each owner service keeps its own table and per-actor semantics; routing
 * the concrete writers through this port is a LATER, per-ledger stage
 * (Stage 6). Today the only behavioural consumer is the flag-gated
 * `balanceAfter` snapshot (Stage 4), which uses {@link computeBalanceAfter}
 * and {@link BucketBalances}.
 *
 * The two distinct three-bucket schemes are intentionally parameterized via
 * a generic bucket-name union (`B`), NOT hard-coded to Connect's
 * pending/available pair — the seller ledger is available|pending|blocked
 * and the treasury is available|pending|reserved.
 */

/**
 * Direction of a ledger movement. Amount is ALWAYS stored as a non-negative
 * magnitude; the sign of the balance delta is conveyed by this discriminator
 * (mirrors `WalletLedgerService.appendWithinTx` and the Connect contract).
 */
export type LedgerDirection = 'credit' | 'debit';

/**
 * A snapshot of every bucket balance (in integer cents) for one actor,
 * keyed by the actor's bucket-name union. e.g. for the seller wallet:
 * `{ available: 1000n, pending: 0n, blocked: 0n }`.
 */
export type BucketBalances<B extends string> = Record<B, bigint>;

/** Idempotency reference for an append — `(type, id)` like the Connect ledger. */
export interface LedgerReference {
  /** Reference type discriminator (e.g. 'sale', 'payout', 'order'). */
  type: string;
  /** Reference id (e.g. the originating transaction/order id). */
  id: string;
}

/**
 * One append request against a shared ledger. `bucket` and the keys of
 * `balanceAfter` are drawn from the actor's bucket-name union `B`.
 */
export interface SharedLedgerAppend<B extends string> {
  /** The bucket this movement targets. */
  bucket: B;
  /** Movement direction; the amount is the unsigned magnitude. */
  direction: LedgerDirection;
  /** Non-negative magnitude in integer cents. */
  amountInCents: bigint;
  /** Stable reason code for the movement. */
  reason: string;
  /** Optional idempotency reference. */
  reference?: LedgerReference;
  /**
   * Optional post-mutation balance snapshot across ALL buckets, captured
   * INSIDE the same transaction that mutated them. When present, a writer
   * persists the per-bucket `balanceAfter*Cents` columns; when omitted, the
   * columns stay NULL (flag-OFF / legacy parity).
   */
  balanceAfter?: BucketBalances<B>;
  /** Arbitrary structured metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * The append-only money-ledger port. A concrete owner service implements
 * `append` against its own per-actor table inside a caller-supplied
 * transaction. `Tx` is intentionally generic so each service can bind its
 * own `Prisma.TransactionClient` without this shared module importing the
 * Prisma client type.
 *
 * @typeParam B  the actor's bucket-name union
 * @typeParam Tx the transaction-client type the writer threads through
 */
export interface SharedLedger<B extends string, Tx> {
  /**
   * Append a single immutable ledger entry inside an existing transaction.
   * The amount must be non-negative; sign is conveyed by `direction`.
   * Append-only: entries are never UPDATEd.
   */
  appendWithinTx(tx: Tx, entry: SharedLedgerAppend<B>): Promise<void>;
}

/**
 * Pure post-mutation balance helper, modeled on the Connect ledger's
 * `balanceAfter*Cents` write: given the bucket balance BEFORE the movement,
 * return the balance AFTER applying a signed magnitude.
 *
 *   credit → priorCents + amountInCents
 *   debit  → priorCents - amountInCents
 *
 * The amount must be a non-negative magnitude (the ledger invariant); a
 * negative amount is a caller bug and throws rather than silently flipping
 * the sign.
 *
 * This is deliberately I/O-free and table-agnostic so it is unit-testable
 * in isolation and reusable by every one of the five writers.
 */
export function computeBalanceAfter(
  priorCents: bigint,
  direction: LedgerDirection,
  amountInCents: bigint,
): bigint {
  if (amountInCents < 0n) {
    throw new RangeError(
      `computeBalanceAfter: amountInCents must be non-negative; got ${amountInCents.toString()}`,
    );
  }
  return direction === 'credit' ? priorCents + amountInCents : priorCents - amountInCents;
}
