// @@index: flag-gated WalletAnticipation cents reader (Stage 9 cut-over).
// Pure projections — no Prisma, no async, no I/O. Decides, at the DTO boundary,
// whether a WalletAnticipation amount is sourced from the new BigInt `*InCents`
// column (÷100) or the legacy Float. Byte-identical to the legacy Float reader
// when KLOEL_ANTICIPATION_CENTS_READ is OFF.

import { isAnticipationCentsReadEnabled } from './wallet.anticipation-cents-read.flag';

/**
 * Resolve a single WalletAnticipation monetary field to a Real-valued (BRL)
 * number for the response DTO.
 *
 * - Flag OFF → always return `floatValue` verbatim (byte-identical legacy).
 * - Flag ON  → prefer `centsValue` (÷100) when present (non-NULL); fall back to
 *   `floatValue` when the cents column is NULL (an un-backfilled historical
 *   row). This makes the cut-over safe even before the backfill reaches 100%
 *   coverage: covered rows read from cents, uncovered rows keep reading Float.
 *
 * Dividing a BigInt cents value by 100 is exact for any persisted money value
 * (cents are integers), so `Number(centsValue) / 100` reproduces the same Real
 * the Float column held when they were dual-written consistently.
 */
export function readAnticipationAmount(floatValue: number, centsValue: bigint | null): number {
  if (!isAnticipationCentsReadEnabled() || centsValue === null) {
    return floatValue;
  }
  return Number(centsValue) / 100;
}

/** A WalletAnticipation row's money fields in both representations. */
export interface AnticipationAmounts {
  originalAmount: number;
  feeAmount: number;
  netAmount: number;
  originalAmountInCents: bigint | null;
  feeAmountInCents: bigint | null;
  netAmountInCents: bigint | null;
}

/** The Real-valued money triple projected for a WalletAnticipation response. */
export interface ResolvedAnticipationAmounts {
  originalAmount: number;
  feeAmount: number;
  netAmount: number;
}

/**
 * Resolve all three WalletAnticipation money fields for a response DTO, each
 * independently preferring its `*InCents` column under the read flag with a
 * per-field Float fallback. Pure projection.
 */
export function resolveAnticipationAmounts(row: AnticipationAmounts): ResolvedAnticipationAmounts {
  return {
    originalAmount: readAnticipationAmount(row.originalAmount, row.originalAmountInCents),
    feeAmount: readAnticipationAmount(row.feeAmount, row.feeAmountInCents),
    netAmount: readAnticipationAmount(row.netAmount, row.netAmountInCents),
  };
}
