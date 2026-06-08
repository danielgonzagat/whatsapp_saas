/**
 * Feature flag: ADDITIVE post-mutation balance snapshot on money ledgers.
 *
 * Money-ledgers migration family (Stage 1 + Stage 4). Two of the five
 * append-only money ledgers — `KloelWalletLedger` (seller earnings) and
 * `MarketplaceTreasuryLedger` (house treasury) — historically did NOT
 * persist a `balanceAfter` snapshot on each entry, unlike the strongest
 * implementation (`ConnectLedgerEntry`, which records
 * `balanceAfterPendingCents` / `balanceAfterAvailableCents`).
 *
 * Stage 1 added nullable `balanceAfter*Cents` columns to both tables.
 * This flag controls Stage 4: when set to the exact string `'true'`, the
 * two ledger writers ALSO populate those columns on NEW writes, reading the
 * post-mutation bucket balances INSIDE the same `$transaction` that mutates
 * the wallet/treasury (so the snapshot is consistent or rolls back together).
 *
 * **DEFAULT OFF.** When unset (or any value other than `'true'`):
 *   - the new columns are left NULL on every write,
 *   - no extra in-transaction read is issued,
 *   - the legacy ledger-append path is byte-identical to before.
 *
 * No reader consumes this flag yet, and NO historical backfill is performed
 * (Stage 5 is a separate, supervised step). The env var is read live on
 * every append so operators and tests can flip it without a restart.
 *
 * @returns true only when KLOEL_LEDGER_BALANCE_SNAPSHOT is exactly 'true'.
 * @see backend/src/common/shared-ledger.port.ts
 * @see backend/src/kloel/wallet-ledger.service.ts
 * @see backend/src/marketplace-treasury/marketplace-treasury.service.ts
 */
export function isLedgerBalanceSnapshotEnabled(): boolean {
  return process.env.KLOEL_LEDGER_BALANCE_SNAPSHOT === 'true';
}
