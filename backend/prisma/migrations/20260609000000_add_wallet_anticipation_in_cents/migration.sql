-- Money-ledgers migration family, Stage 2 (additive, online-safe).
--
-- WalletAnticipation (RAC_WalletAnticipation) is the ONE money table still
-- storing its amounts as Float (originalAmount / feeAmount / netAmount). This
-- migration adds the nullable BigInt `*InCents` mirror columns. NO Float column
-- is dropped (the destructive Float DROP is a separate, supervised final stage).
--
-- These columns are NULLABLE with no backfill: historical rows stay NULL, and
-- new rows are only populated when KLOEL_ANTICIPATION_CENTS_DUALWRITE is enabled.
-- The guarded KLOEL_ANTICIPATION_CENTS_BACKFILL fills historical rows later.
-- ADD COLUMN of a nullable column is a metadata-only, online-safe operation on
-- Postgres (no table rewrite, no lock escalation).
--
-- IF NOT EXISTS makes this migration idempotent and re-runnable, matching the
-- repo convention.

ALTER TABLE "RAC_WalletAnticipation"
  ADD COLUMN IF NOT EXISTS "originalAmountInCents" BIGINT,
  ADD COLUMN IF NOT EXISTS "feeAmountInCents" BIGINT,
  ADD COLUMN IF NOT EXISTS "netAmountInCents" BIGINT;
