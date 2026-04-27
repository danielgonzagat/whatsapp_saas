-- Align RAC_Product columns with current Prisma schema.
--
-- Production was originally bootstrapped via `prisma db push`, so the
-- live DB already has every column the schema declares. CI / fresh
-- test databases start from `migrate deploy` against the migration
-- folder, where many columns added after the 2025-12 baseline (format,
-- status, affiliate*, commission*, after-pay, shipping, marketing
-- URLs, etc.) were never materialised. POST /products (and any
-- product write) blew up in CI with `column "format" of relation
-- "RAC_Product" does not exist`.
--
-- This migration is forward-only and idempotent
-- (`ADD COLUMN IF NOT EXISTS`) so re-running it on a baselined
-- production DB is a no-op.

ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "format" TEXT NOT NULL DEFAULT 'PHYSICAL';
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';

ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "salesPageUrl" TEXT;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "thankyouUrl" TEXT;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "thankyouBoletoUrl" TEXT;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "thankyouPixUrl" TEXT;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "reclameAquiUrl" TEXT;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "supportEmail" TEXT;

ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "warrantyDays" INTEGER;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "shippingType" TEXT;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "shippingValue" DOUBLE PRECISION;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "originCep" TEXT;

ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "affiliateEnabled"
    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "affiliateVisible"
    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "affiliateAutoApprove"
    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "affiliateAccessData"
    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "affiliateAccessAbandoned"
    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "affiliateFirstInstallment"
    BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "commissionType"
    TEXT NOT NULL DEFAULT 'last_click';
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "commissionCookieDays"
    INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "commissionPercent"
    DOUBLE PRECISION NOT NULL DEFAULT 30.0;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "commissionLastClickPercent" DOUBLE PRECISION;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "commissionOtherClicksPercent" DOUBLE PRECISION;

ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "merchandContent" TEXT;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "affiliateTerms" TEXT;

ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "afterPayDuplicateAddress"
    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "afterPayAffiliateCharge"
    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "afterPayChargeValue" DOUBLE PRECISION;
ALTER TABLE "RAC_Product"
    ADD COLUMN IF NOT EXISTS "afterPayShippingProvider" TEXT;

-- Index on status referenced by `@@index([workspaceId, status])` in schema.
CREATE INDEX IF NOT EXISTS "RAC_Product_workspaceId_status_idx"
  ON "RAC_Product" ("workspaceId", "status");

-- RAC_CheckoutOrder gained a free-form `metadata` JSON column in the
-- schema (CheckoutOrder model) but the originating migration never
-- declared it. Same forward-only / idempotent treatment as the
-- product columns above.
ALTER TABLE "RAC_CheckoutOrder"
    ADD COLUMN IF NOT EXISTS metadata JSONB;
