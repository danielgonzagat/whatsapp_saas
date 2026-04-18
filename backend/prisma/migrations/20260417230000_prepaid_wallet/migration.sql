-- SP-STRIPE-4 — Prepaid Wallet (FASE 4 of stripe migration plan).
--
-- Per-workspace prepaid balance for usage-metered services (AI agent
-- messages, WhatsApp sends, generic API calls). Funded by direct
-- PaymentIntents on the platform's own Stripe account; debited atomically
-- at usage time.
--
-- Append-only transactions table mirrors the LedgerEntry pattern. The
-- @@unique on (reference_type, reference_id, type) is the database-level
-- idempotency guard — a re-delivered Stripe topup webhook cannot create
-- a duplicate TOPUP entry.

-- CreateEnum
CREATE TYPE "PrepaidWalletTxType" AS ENUM ('TOPUP', 'USAGE', 'REFUND', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "prepaid_wallets" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "balance_cents" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "auto_recharge_enabled" BOOLEAN NOT NULL DEFAULT false,
  "auto_recharge_threshold_cents" BIGINT,
  "auto_recharge_amount_cents" BIGINT,
  "default_payment_method_id" TEXT,
  "stripe_customer_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prepaid_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prepaid_wallets_workspace_id_key" ON "prepaid_wallets"("workspace_id");

-- CreateIndex
CREATE INDEX "prepaid_wallets_stripe_customer_id_idx" ON "prepaid_wallets"("stripe_customer_id");

-- CreateTable
CREATE TABLE "prepaid_wallet_transactions" (
  "id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "type" "PrepaidWalletTxType" NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "balance_after_cents" BIGINT NOT NULL,
  "reference_type" TEXT NOT NULL,
  "reference_id" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prepaid_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prepaid_wallet_transactions_wallet_id_created_at_idx"
  ON "prepaid_wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prepaid_wallet_transactions_reference_type_reference_id_type_key"
  ON "prepaid_wallet_transactions"("reference_type", "reference_id", "type");

-- AddForeignKey
ALTER TABLE "prepaid_wallet_transactions"
  ADD CONSTRAINT "prepaid_wallet_transactions_wallet_id_fkey"
  FOREIGN KEY ("wallet_id")
  REFERENCES "prepaid_wallets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "usage_prices" (
  "id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "price_per_unit_cents" BIGINT NOT NULL,
  "unit" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "usage_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_prices_operation_key" ON "usage_prices"("operation");

-- CreateIndex
CREATE INDEX "usage_prices_active_idx" ON "usage_prices"("active");
