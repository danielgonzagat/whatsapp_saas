/**
 * Feature flag: idempotent historical backfill of WalletAnticipation cents.
 *
 * Money-ledgers migration family (Stage 8). The live dual-write
 * (KLOEL_ANTICIPATION_CENTS_DUALWRITE) only populates the new `*InCents`
 * columns on NEW anticipation rows. Flipping the reader cut-over
 * (KLOEL_ANTICIPATION_CENTS_READ) before backfilling history would make the
 * cents path miss every pre-migration row. This flag gates the offline
 * backfill that fills the cents columns for existing rows where they are NULL.
 *
 * **DEFAULT OFF.** When unset (or any value other than `'true'`):
 *   - {@link WalletAnticipationBackfillService.backfill} is a no-op returning
 *     `{ enabled: false, ... }`,
 *   - the bootstrap runner skips the backfill entirely.
 *
 * The backfill NEVER touches rows whose cents columns are already non-NULL,
 * so a re-run (or overlap with the live dual-write) is a safe no-op. The
 * read-only parity check is NOT gated by this flag — it can always run.
 *
 * @returns true only when KLOEL_ANTICIPATION_CENTS_BACKFILL is exactly 'true'.
 * @see backend/src/kloel/wallet-anticipation-backfill.service.ts
 */
export function isAnticipationCentsBackfillEnabled(): boolean {
  return process.env.KLOEL_ANTICIPATION_CENTS_BACKFILL === 'true';
}

/**
 * Feature flag: idempotent historical backfill of money-ledger
 * `balanceAfter*Cents` snapshots (KloelWalletLedger + MarketplaceTreasuryLedger).
 *
 * Money-ledgers migration family (Stage 5). The live snapshot dual-write
 * (KLOEL_LEDGER_BALANCE_SNAPSHOT) only populates `balanceAfter*Cents` on NEW
 * ledger rows. This flag gates the offline backfill that recomputes those
 * snapshots for historical rows from the cumulative prior ledger entries,
 * per (walletId, bucket), replaying the signed magnitudes in createdAt order.
 *
 * **DEFAULT OFF.** When unset (or any value other than `'true'`):
 *   - {@link LedgerBalanceAfterBackfillService.backfill} is a no-op,
 *   - the bootstrap runner skips it.
 *
 * The backfill NEVER touches rows whose `balanceAfter*Cents` are already
 * non-NULL, so a re-run is a safe no-op. Parity is not gated by this flag.
 *
 * @returns true only when KLOEL_LEDGER_BALANCE_BACKFILL is exactly 'true'.
 * @see backend/src/kloel/wallet-anticipation-backfill.service.ts
 */
export function isLedgerBalanceBackfillEnabled(): boolean {
  return process.env.KLOEL_LEDGER_BALANCE_BACKFILL === 'true';
}
