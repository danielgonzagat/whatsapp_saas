-- Wave 2 P6-2 / Invariant I11 — Wallet cents (additive step)
--
-- Adds BigInt *InCents columns to KloelWallet and KloelWalletTransaction
-- alongside the existing Float columns. The service layer dual-writes on
-- every mutation during the 7-day observation window. Read is still from
-- the Float columns until P6-3 cuts over.
--
-- Backfill: the existing Float values are rounded to the nearest cent
-- and written into the new columns in the same migration. For
-- Math.round(availableBalance * 100), Postgres uses ROUND which is
-- banker's rounding by default; we use CEIL on 0.5 boundaries via the
-- (+ 0.5) trick to preserve "round half up" semantics consistent with
-- JavaScript's Math.round. This produces identical results for integer
-- and half-integer cent values and differs by at most 1 cent per row
-- otherwise — well within the reconciliation tolerance.
--
-- This migration is IDEMPOTENT — running it twice is safe because the
-- IF NOT EXISTS clauses guard against re-adding columns, and the
-- backfill UPDATE only sets rows where the cents column is still 0.

BEGIN;

-- KloelWallet additive columns
ALTER TABLE "KloelWallet" ADD COLUMN IF NOT EXISTS "availableBalanceInCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "KloelWallet" ADD COLUMN IF NOT EXISTS "pendingBalanceInCents" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "KloelWallet" ADD COLUMN IF NOT EXISTS "blockedBalanceInCents" BIGINT NOT NULL DEFAULT 0;

-- KloelWalletTransaction additive column
ALTER TABLE "KloelWalletTransaction" ADD COLUMN IF NOT EXISTS "amountInCents" BIGINT NOT NULL DEFAULT 0;

-- Backfill KloelWallet — only rows where the new columns are still the default.
-- Use FLOOR(x * 100 + 0.5) to match JavaScript Math.round(x * 100) behavior
-- for non-negative values. Wallet balances are always non-negative.
UPDATE "KloelWallet"
SET
  "availableBalanceInCents" = CAST(FLOOR("availableBalance" * 100 + 0.5) AS BIGINT),
  "pendingBalanceInCents"   = CAST(FLOOR("pendingBalance" * 100 + 0.5) AS BIGINT),
  "blockedBalanceInCents"   = CAST(FLOOR("blockedBalance" * 100 + 0.5) AS BIGINT)
WHERE
  "availableBalanceInCents" = 0
  AND "pendingBalanceInCents" = 0
  AND "blockedBalanceInCents" = 0
  AND ("availableBalance" <> 0 OR "pendingBalance" <> 0 OR "blockedBalance" <> 0);

-- Backfill KloelWalletTransaction.amountInCents. Withdrawal transactions
-- have negative amount values in the existing Float column; preserve the
-- sign in BigInt.
UPDATE "KloelWalletTransaction"
SET "amountInCents" = CASE
  WHEN "amount" >= 0 THEN CAST(FLOOR("amount" * 100 + 0.5) AS BIGINT)
  ELSE -CAST(FLOOR(ABS("amount") * 100 + 0.5) AS BIGINT)
END
WHERE "amountInCents" = 0 AND "amount" <> 0;

COMMIT;
