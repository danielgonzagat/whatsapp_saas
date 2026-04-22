-- Rename legacy platform-wallet Stripe marketplace objects to the
-- marketplace-treasury naming used by the current architecture.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformWalletBucket') THEN
    ALTER TYPE "PlatformWalletBucket" RENAME TO "MarketplaceTreasuryBucket";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformLedgerKind') THEN
    ALTER TYPE "PlatformLedgerKind" RENAME TO "MarketplaceTreasuryLedgerKind";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'MarketplaceTreasuryLedgerKind'
      AND e.enumlabel = 'PLATFORM_FEE_CREDIT'
  ) THEN
    ALTER TYPE "MarketplaceTreasuryLedgerKind"
      RENAME VALUE 'PLATFORM_FEE_CREDIT' TO 'MARKETPLACE_FEE_CREDIT';
  END IF;
END $$;

ALTER TABLE IF EXISTS "platform_wallets" RENAME TO "marketplace_treasuries";
ALTER TABLE IF EXISTS "platform_wallet_ledger" RENAME TO "marketplace_treasury_ledger";
ALTER TABLE IF EXISTS "platform_fees" RENAME TO "marketplace_fees";

ALTER INDEX IF EXISTS "platform_wallets_currency_key"
  RENAME TO "marketplace_treasuries_currency_key";
ALTER INDEX IF EXISTS "platform_wallet_ledger_wallet_id_created_at_idx"
  RENAME TO "marketplace_treasury_ledger_wallet_id_created_at_idx";
ALTER INDEX IF EXISTS "platform_wallet_ledger_kind_created_at_idx"
  RENAME TO "marketplace_treasury_ledger_kind_created_at_idx";
ALTER INDEX IF EXISTS "platform_wallet_ledger_order_id_idx"
  RENAME TO "marketplace_treasury_ledger_order_id_idx";
ALTER INDEX IF EXISTS "platform_wallet_ledger_order_kind_unique"
  RENAME TO "marketplace_treasury_ledger_order_kind_unique";
ALTER INDEX IF EXISTS "platform_fees_method_active_from_idx"
  RENAME TO "marketplace_fees_method_active_from_idx";
ALTER INDEX IF EXISTS "platform_fees_active_to_idx"
  RENAME TO "marketplace_fees_active_to_idx";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_wallets_pkey'
  ) THEN
    ALTER TABLE "marketplace_treasuries"
      RENAME CONSTRAINT "platform_wallets_pkey" TO "marketplace_treasuries_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_wallet_ledger_pkey'
  ) THEN
    ALTER TABLE "marketplace_treasury_ledger"
      RENAME CONSTRAINT "platform_wallet_ledger_pkey" TO "marketplace_treasury_ledger_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_fees_pkey'
  ) THEN
    ALTER TABLE "marketplace_fees"
      RENAME CONSTRAINT "platform_fees_pkey" TO "marketplace_fees_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_wallet_ledger_wallet_id_fkey'
  ) THEN
    ALTER TABLE "marketplace_treasury_ledger"
      RENAME CONSTRAINT "platform_wallet_ledger_wallet_id_fkey"
      TO "marketplace_treasury_ledger_wallet_id_fkey";
  END IF;
END $$;
