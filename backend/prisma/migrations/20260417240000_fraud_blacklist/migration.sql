-- SP-STRIPE-5 — Fraud Blacklist (FASE 5 of stripe migration plan).
--
-- Platform-wide blacklist of fraud signals shared across all sellers.
-- The unique constraint on (type, value) makes inserts idempotent —
-- the same CPF/email/IP can be added multiple times without
-- duplicating rows.

-- CreateEnum
CREATE TYPE "FraudBlacklistType" AS ENUM (
  'CPF',
  'CNPJ',
  'EMAIL',
  'IP',
  'DEVICE_FINGERPRINT',
  'CARD_BIN'
);

-- CreateTable
CREATE TABLE "fraud_blacklist" (
  "id" TEXT NOT NULL,
  "type" "FraudBlacklistType" NOT NULL,
  "value" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "added_by" TEXT,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fraud_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fraud_blacklist_type_value_key" ON "fraud_blacklist"("type", "value");

-- CreateIndex
CREATE INDEX "fraud_blacklist_expires_at_idx" ON "fraud_blacklist"("expires_at");
