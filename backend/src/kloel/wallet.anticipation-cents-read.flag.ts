/**
 * Feature flag: WalletAnticipation cents reader cut-over.
 *
 * Money-ledgers migration family (Stage 9, anticipation tranche). When set to
 * the exact string `'true'`, response builders for WalletAnticipation PREFER
 * the BigInt `*InCents` columns (÷100 at the DTO boundary) when they are
 * present, falling back to the legacy Float column when the cents column is
 * NULL (un-backfilled row).
 *
 * **DEFAULT OFF.** When unset (or any value other than `'true'`):
 *   - readers return the legacy Float value verbatim — byte-identical to the
 *     pre-migration response.
 *
 * Flip this ONLY after the dual-write has run for a window AND the backfill has
 * achieved full parity coverage (gate on
 * {@link WalletAnticipationBackfillService.parity} `coverage === 1`,
 * `mismatched === 0`). Revertible: turning the flag OFF restores the Float
 * reader with zero data change.
 *
 * @returns true only when KLOEL_ANTICIPATION_CENTS_READ is exactly 'true'.
 * @see backend/src/kloel/wallet.anticipation.read.ts
 */
export function isAnticipationCentsReadEnabled(): boolean {
  return process.env.KLOEL_ANTICIPATION_CENTS_READ === 'true';
}
