// @@index: pure Float→cents conversion + parity helpers for the
// WalletAnticipation money migration (Stage 2 / 7 / 8 of the money-ledgers
// migration family). No Prisma, no async, no I/O — side-effect-free so it is
// unit-testable in isolation and reusable by the dual-write, backfill, parity
// and reader paths without spinning a PrismaService.
//
// Why this file exists: the WalletAnticipation row is the ONE money table that
// still stores its amounts as Float (originalAmount / feeAmount / netAmount).
// The migration adds nullable BigInt `*InCents` columns; this module owns the
// single canonical Float→cents rounding so the dual-write (NEW rows), the
// backfill (historical rows) and the parity check all agree byte-for-byte.

/**
 * Convert a Real-valued (BRL) monetary amount to integer cents.
 *
 * `Math.round(amount * 100)` is the SAME rounding `toSafeCents` (the wallet
 * money math) uses, so a row dual-written from `calculateAnticipationSplit`
 * and a row backfilled from the persisted Float converge to the identical
 * cents value. Returns a `bigint` because the Prisma column is `BigInt?`.
 *
 * Throws on a non-finite input or a value that does not round to a safe
 * integer — a NULL/garbage Float is a caller/data bug and must surface rather
 * than silently persist `0n` or a lossy value.
 */
export function anticipationAmountToCents(amount: number): bigint {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`anticipationAmountToCents: amount must be finite; got ${String(amount)}`);
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`anticipationAmountToCents: ${amount} does not round to a safe integer`);
  }
  return BigInt(cents);
}

/**
 * The three cents columns derived from a WalletAnticipation row's Float
 * amounts. Shared shape for the dual-write `create` fragment, the backfill
 * `update` fragment, and the parity recompute.
 */
export interface AnticipationCents {
  originalAmountInCents: bigint;
  feeAmountInCents: bigint;
  netAmountInCents: bigint;
}

/**
 * Derive all three cents columns from the persisted Float amounts. Used by:
 *   - the live dual-write (NEW rows, from the same Floats persisted),
 *   - the historical backfill (existing rows with NULL cents),
 *   - the read-only parity check (recompute vs stored).
 *
 * Pure projection of three independent Float→cents conversions — it does NOT
 * re-derive net from original−fee, because the persisted Floats are the source
 * of truth for a backfill and each is rounded independently (matching how
 * `calculateAnticipationSplit` rounds feeAmount and net independently).
 */
export function deriveAnticipationCents(input: {
  originalAmount: number;
  feeAmount: number;
  netAmount: number;
}): AnticipationCents {
  return {
    originalAmountInCents: anticipationAmountToCents(input.originalAmount),
    feeAmountInCents: anticipationAmountToCents(input.feeAmount),
    netAmountInCents: anticipationAmountToCents(input.netAmount),
  };
}

/**
 * Per-row parity verdict comparing the recomputed `Float*100` cents against the
 * stored `*InCents` columns. `matched` is true only when ALL THREE buckets
 * agree AND every stored column is non-NULL. A row with any NULL cents column
 * is `covered=false` (not yet backfilled) and never counts as matched.
 */
export interface AnticipationRowParity {
  covered: boolean;
  matched: boolean;
}

/**
 * Compare one row's recomputed cents against its stored cents columns.
 *
 * A row is `covered` when all three stored columns are non-NULL. A covered row
 * is `matched` only when each stored column equals the recompute. Uncovered
 * rows are never matched (they still need a backfill). Pure and I/O-free.
 */
export function compareAnticipationRowParity(row: {
  originalAmount: number;
  feeAmount: number;
  netAmount: number;
  originalAmountInCents: bigint | null;
  feeAmountInCents: bigint | null;
  netAmountInCents: bigint | null;
}): AnticipationRowParity {
  const covered =
    row.originalAmountInCents !== null &&
    row.feeAmountInCents !== null &&
    row.netAmountInCents !== null;
  if (!covered) {
    return { covered: false, matched: false };
  }
  const recomputed = deriveAnticipationCents(row);
  const matched =
    recomputed.originalAmountInCents === row.originalAmountInCents &&
    recomputed.feeAmountInCents === row.feeAmountInCents &&
    recomputed.netAmountInCents === row.netAmountInCents;
  return { covered: true, matched };
}
