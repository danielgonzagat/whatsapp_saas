/**
 * Feature flag: ADDITIVE WalletAnticipation Float→BigInt cents dual-write.
 *
 * Money-ledgers migration family (Stage 7). `WalletAnticipation` is the ONE
 * money table still storing amounts as Float (originalAmount / feeAmount /
 * netAmount). Stage 2 added nullable `*InCents` BigInt columns. This flag
 * controls the dual-write: when set to the exact string `'true'`, the
 * anticipation-row write (`runAnticipationTx` →
 * `buildWalletAnticipationRowData`) ALSO populates the three `*InCents`
 * columns, derived from the SAME Float amounts via the canonical
 * `deriveAnticipationCents` rounding.
 *
 * **DEFAULT OFF.** When unset (or any value other than `'true'`):
 *   - the new columns are left NULL on every NEW anticipation row,
 *   - the persisted row payload is byte-identical to the pre-migration write.
 *
 * No reader consumes this flag (the reader is gated separately by
 * KLOEL_ANTICIPATION_CENTS_READ). No historical backfill is performed by this
 * flag (that is KLOEL_ANTICIPATION_CENTS_BACKFILL, a separate supervised step).
 * The env var is read live on every write so operators and tests can flip it
 * without a restart.
 *
 * @returns true only when KLOEL_ANTICIPATION_CENTS_DUALWRITE is exactly 'true'.
 * @see backend/src/kloel/wallet.anticipation.cents.ts
 * @see backend/src/kloel/wallet.helpers.responses.ts
 */
export function isAnticipationCentsDualWriteEnabled(): boolean {
  return process.env.KLOEL_ANTICIPATION_CENTS_DUALWRITE === 'true';
}
