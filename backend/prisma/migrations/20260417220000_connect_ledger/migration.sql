-- SP-STRIPE-2 — Connect Ledger (FASE 2 of stripe migration plan).
--
-- Per-Connected-Account dual-balance ledger. Tracks pending vs available
-- cents in KLOEL's view, independently of what Stripe says the connected
-- account technically holds. Payouts to seller/role bank accounts go
-- through Kloel-orchestrated stripe.payouts.create() — never automatic.
--
-- Append-only: connect_ledger_entries are never UPDATEd. Corrections are
-- new ADJUSTMENT entries. The unique constraint on (reference_type,
-- reference_id, type) enforces idempotency at the database level: the
-- same Stripe payment_intent webhook re-delivered cannot create a
-- duplicate CREDIT_PENDING entry.

-- CreateEnum
CREATE TYPE "ConnectAccountType" AS ENUM (
  'SELLER',
  'AFFILIATE',
  'SUPPLIER',
  'COPRODUCER',
  'MANAGER'
);

-- CreateEnum
CREATE TYPE "ConnectLedgerEntryType" AS ENUM (
  'CREDIT_PENDING',
  'MATURE',
  'DEBIT_PAYOUT',
  'DEBIT_CHARGEBACK',
  'DEBIT_REFUND',
  'ADJUSTMENT'
);

-- CreateTable
CREATE TABLE "connect_account_balances" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "stripe_account_id" TEXT NOT NULL,
  "account_type" "ConnectAccountType" NOT NULL,
  "pending_balance_cents" BIGINT NOT NULL DEFAULT 0,
  "available_balance_cents" BIGINT NOT NULL DEFAULT 0,
  "lifetime_received_cents" BIGINT NOT NULL DEFAULT 0,
  "lifetime_paid_out_cents" BIGINT NOT NULL DEFAULT 0,
  "lifetime_chargebacks_cents" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "connect_account_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connect_account_balances_stripe_account_id_key"
  ON "connect_account_balances"("stripe_account_id");

-- CreateIndex
CREATE INDEX "connect_account_balances_workspace_id_idx"
  ON "connect_account_balances"("workspace_id");

-- CreateIndex
CREATE INDEX "connect_account_balances_account_type_idx"
  ON "connect_account_balances"("account_type");

-- CreateTable
CREATE TABLE "connect_ledger_entries" (
  "id" TEXT NOT NULL,
  "account_balance_id" TEXT NOT NULL,
  "type" "ConnectLedgerEntryType" NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "balance_after_pending_cents" BIGINT NOT NULL,
  "balance_after_available_cents" BIGINT NOT NULL,
  "reference_type" TEXT NOT NULL,
  "reference_id" TEXT NOT NULL,
  "scheduled_for" TIMESTAMP(3),
  "matured" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "connect_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connect_ledger_entries_account_balance_id_created_at_idx"
  ON "connect_ledger_entries"("account_balance_id", "created_at");

-- CreateIndex
CREATE INDEX "connect_ledger_entries_scheduled_for_matured_idx"
  ON "connect_ledger_entries"("scheduled_for", "matured");

-- CreateIndex
CREATE UNIQUE INDEX "connect_ledger_entries_reference_type_reference_id_type_key"
  ON "connect_ledger_entries"("reference_type", "reference_id", "type");

-- AddForeignKey
ALTER TABLE "connect_ledger_entries"
  ADD CONSTRAINT "connect_ledger_entries_account_balance_id_fkey"
  FOREIGN KEY ("account_balance_id")
  REFERENCES "connect_account_balances"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "connect_maturation_rules" (
  "id" TEXT NOT NULL,
  "product_id" TEXT,
  "account_type" "ConnectAccountType" NOT NULL,
  "delay_days" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "connect_maturation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connect_maturation_rules_product_id_account_type_idx"
  ON "connect_maturation_rules"("product_id", "account_type");

-- CreateIndex
CREATE UNIQUE INDEX "connect_maturation_rules_product_id_account_type_key"
  ON "connect_maturation_rules"("product_id", "account_type");
