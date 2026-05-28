/**
 * Pure math + validation helpers shared by {@link LedgerService} mutations.
 *
 * IMPORTANT (money-path contract — preserve exact behavior):
 * - {@link assertPositiveAmount} emits the same RangeError text the previous
 *   inlined guards produced: `"${operation}: amountCents must be > 0 (got ${n})"`.
 *   Existing tests match `/must be > 0/`, so the literal substring is locked.
 * - {@link computeAbsorptionSplit} reproduces the exact PENDING-first formula
 *   used by chargeback and refund debits: take as much as possible from
 *   PENDING (capped at the request), spill the remainder into AVAILABLE.
 *   Both outputs are bigint cents so callers preserve append-only ledger math.
 *
 * These functions are pure: no Prisma, no logging, no I/O.
 */

/** Operations that emit the shared positive-amount guard. */
export type LedgerAmountOperation =
  | 'creditPending'
  | 'creditAvailableByAdjustment'
  | 'debitAvailableForPayout'
  | 'debitForChargeback'
  | 'debitForRefund';

/**
 * Guard that every ledger mutation runs before touching state. Throws
 * RangeError if `amountCents` is not strictly positive. Message format is
 * load-bearing: error-paths spec asserts against `/must be > 0/`.
 */
export function assertPositiveAmount(amountCents: bigint, operation: LedgerAmountOperation): void {
  if (amountCents <= 0n) {
    throw new RangeError(`${operation}: amountCents must be > 0 (got ${amountCents.toString()})`);
  }
}

/**
 * Split a debit between PENDING and AVAILABLE buckets, PENDING-first.
 *
 * Matches the inlined formula previously used in chargeback + refund:
 *   fromPending  = min(pendingBalanceCents, amountCents)
 *   fromAvailable = amountCents - fromPending
 *
 * Both buckets stay in bigint cents. The caller is responsible for applying
 * the deltas to the persisted balance row and for accepting that AVAILABLE
 * may go negative when PENDING is exhausted (chargeback/refund contract).
 */
export function computeAbsorptionSplit(
  amountCents: bigint,
  pendingBalanceCents: bigint,
): { fromPending: bigint; fromAvailable: bigint } {
  const fromPending = pendingBalanceCents >= amountCents ? amountCents : pendingBalanceCents;
  const fromAvailable = amountCents - fromPending;
  return { fromPending, fromAvailable };
}

/**
 * Full PENDING-first absorption: returns the split and the post-debit balances.
 *
 * Shared by chargeback + refund. AVAILABLE may go negative when PENDING is
 * exhausted — that is the documented contract (caller must not clamp).
 *
 * Pure — no Prisma, no logging. Both inputs and outputs are bigint cents.
 */
export function applyAbsorptionDebit(
  amountCents: bigint,
  pendingBalanceCents: bigint,
  availableBalanceCents: bigint,
): {
  fromPending: bigint;
  fromAvailable: bigint;
  newPending: bigint;
  newAvailable: bigint;
} {
  const { fromPending, fromAvailable } = computeAbsorptionSplit(amountCents, pendingBalanceCents);
  return {
    fromPending,
    fromAvailable,
    newPending: pendingBalanceCents - fromPending,
    newAvailable: availableBalanceCents - fromAvailable,
  };
}

/**
 * Merge caller-supplied metadata with the canonical absorbed-from-* fields.
 *
 * Shared by chargeback + refund persistence. Both absorbed amounts are
 * stringified bigints so they round-trip through Prisma `Json` columns.
 * Pure — no I/O.
 */
export function buildAbsorptionMetadata(
  callerMetadata: Record<string, unknown> | undefined,
  fromPending: bigint,
  fromAvailable: bigint,
): Record<string, unknown> {
  return {
    ...(callerMetadata ?? {}),
    absorbedFromPendingCents: fromPending.toString(),
    absorbedFromAvailableCents: fromAvailable.toString(),
  };
}
