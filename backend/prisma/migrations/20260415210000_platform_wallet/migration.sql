-- SP-9 — Platform Wallet v0
-- Creates PlatformWallet + PlatformWalletLedger + PlatformFee.
-- The ledger is application-append-only (mirrors KloelWalletLedger
-- pattern). A partial unique index enforces I-ADMIN-W5 at the
-- database level: for any non-NULL (order_id, kind) pair, only one
-- row can be appended. Adjustments without an order_id can still be
-- appended freely.

-- CreateEnum
CREATE TYPE "PlatformWalletBucket" AS ENUM ('AVAILABLE', 'PENDING', 'RESERVED');

-- CreateEnum
CREATE TYPE "PlatformLedgerKind" AS ENUM (
  'PLATFORM_FEE_CREDIT',
  'CHARGEBACK_RESERVE',
  'REFUND_DEBIT',
  'CHARGEBACK_DEBIT',
  'PAYOUT_DEBIT',
  'ADJUSTMENT_CREDIT',
  'ADJUSTMENT_DEBIT',
  'RESERVE_RELEASE'
);

-- CreateTable
CREATE TABLE "platform_wallets" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "available_balance_in_cents" BIGINT NOT NULL DEFAULT 0,
    "pending_balance_in_cents" BIGINT NOT NULL DEFAULT 0,
    "reserved_balance_in_cents" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_wallets_currency_key" ON "platform_wallets"("currency");

-- CreateTable
CREATE TABLE "platform_wallet_ledger" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "bucket" "PlatformWalletBucket" NOT NULL,
    "amount_in_cents" BIGINT NOT NULL,
    "kind" "PlatformLedgerKind" NOT NULL,
    "order_id" TEXT,
    "fee_snapshot_id" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_wallet_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_wallet_ledger_wallet_id_created_at_idx" ON "platform_wallet_ledger"("wallet_id", "created_at");
CREATE INDEX "platform_wallet_ledger_kind_created_at_idx" ON "platform_wallet_ledger"("kind", "created_at");
CREATE INDEX "platform_wallet_ledger_order_id_idx" ON "platform_wallet_ledger"("order_id");

-- I-ADMIN-W5 — (order_id, kind) uniqueness for non-NULL order_id.
-- Replaying the split for the same order can never double-credit.
CREATE UNIQUE INDEX "platform_wallet_ledger_order_kind_unique"
  ON "platform_wallet_ledger"("order_id", "kind")
  WHERE "order_id" IS NOT NULL;

-- CreateTable
CREATE TABLE "platform_fees" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "fixed_fee_in_cents" INTEGER NOT NULL DEFAULT 0,
    "volume_floor_in_cents" BIGINT NOT NULL DEFAULT 0,
    "volume_ceiling_in_cents" BIGINT,
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_fees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_fees_method_active_from_idx" ON "platform_fees"("method", "active_from");
CREATE INDEX "platform_fees_active_to_idx" ON "platform_fees"("active_to");

-- AddForeignKey
ALTER TABLE "platform_wallet_ledger"
  ADD CONSTRAINT "platform_wallet_ledger_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "platform_wallets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a default BRL wallet so the admin UI always has something to
-- display. Zero balances, no ledger entries. Idempotent: ON CONFLICT
-- DO NOTHING so re-runs are safe.
INSERT INTO "platform_wallets" ("id", "currency", "created_at", "updated_at")
  VALUES (
    'platform_wallet_brl_seed',
    'BRL',
    NOW(),
    NOW()
  )
  ON CONFLICT ("currency") DO NOTHING;
