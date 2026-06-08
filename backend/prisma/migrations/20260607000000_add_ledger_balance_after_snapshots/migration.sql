-- Money-ledgers migration family, Stage 1 (additive, online-safe).
--
-- Adds nullable post-mutation bucket-balance snapshot columns to the two
-- ledger tables that were MISSING balanceAfter (KloelWalletLedger and
-- MarketplaceTreasuryLedger), mirroring the Connect ledger contract
-- (connect_ledger_entries.balance_after_pending_cents /
--  balance_after_available_cents).
--
-- These columns are NULLABLE with no backfill: historical rows stay NULL,
-- and new rows are only populated when the KLOEL_LEDGER_BALANCE_SNAPSHOT
-- feature flag is enabled. ADD COLUMN of a nullable column is a metadata-only,
-- online-safe operation (no table rewrite, no lock escalation on Postgres).
--
-- IF NOT EXISTS makes this migration idempotent and re-runnable, matching the
-- repo convention.

-- Seller earnings ledger (RAC_KloelWalletLedger): buckets available|pending|blocked.
ALTER TABLE "RAC_KloelWalletLedger"
  ADD COLUMN IF NOT EXISTS "balanceAfterAvailableCents" BIGINT,
  ADD COLUMN IF NOT EXISTS "balanceAfterPendingCents" BIGINT,
  ADD COLUMN IF NOT EXISTS "balanceAfterBlockedCents" BIGINT;

-- House treasury ledger (marketplace_treasury_ledger): buckets available|pending|reserved.
ALTER TABLE "marketplace_treasury_ledger"
  ADD COLUMN IF NOT EXISTS "balance_after_available_cents" BIGINT,
  ADD COLUMN IF NOT EXISTS "balance_after_pending_cents" BIGINT,
  ADD COLUMN IF NOT EXISTS "balance_after_reserved_cents" BIGINT;
