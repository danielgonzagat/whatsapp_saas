-- Align RAC_CheckoutConfig columns + create missing RAC_ProductCampaign.
--
-- Production was bootstrapped via `prisma db push` so the live DB has
-- every column the schema declares. CI / fresh test databases start
-- from `migrate deploy` against the migration folder, where:
--
--   1. The RAC_CheckoutConfig chat/social-proof/steps/imagery columns
--      were added to schema after the original create migration
--      (20260328050000_add_checkout_system) and never materialised.
--      POST /checkout/products/:productId/plans (which inserts a
--      default CheckoutConfig row) blew up with
--      `column "chatEnabled" of relation "RAC_CheckoutConfig"
--       does not exist`.
--
--   2. The ProductCampaign table was originally created via
--      `prisma db push` and never via a migration. The
--      20260425013841_rac_table_rename migration only RENAMEs
--      `IF EXISTS`, so on CI the renamed RAC_ProductCampaign was
--      simply absent. Loading a product with campaigns blew up with
--      `relation "public.RAC_ProductCampaign" does not exist`.
--
-- This migration is forward-only and idempotent
-- (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`) so
-- re-running it on a baselined production DB is a no-op.

-- ─────────────────────────────────────────────────────────────────────
-- 1. RAC_CheckoutConfig column alignment
-- ─────────────────────────────────────────────────────────────────────

-- Chat Kloel no checkout
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatWelcomeMessage" TEXT
DEFAULT 'Oi! Tem alguma duvida? Estou aqui pra ajudar';
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatDelay" INTEGER DEFAULT 3000;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatPosition" TEXT DEFAULT 'bottom-right';
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatColor" TEXT;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatOfferDiscount" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatDiscountCode" TEXT;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "chatSupportPhone" TEXT;

-- Social Proof
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "socialProofEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "socialProofAlerts" JSONB DEFAULT '[]';
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "socialProofCustomNames" TEXT;

-- Etapas
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "enableSteps" BOOLEAN NOT NULL DEFAULT TRUE;

-- Imagens basicas
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "coverImage" TEXT;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "secondaryImage" TEXT;
ALTER TABLE "RAC_CheckoutConfig"
ADD COLUMN IF NOT EXISTS "sideImage" TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 2. RAC_ProductCampaign create-if-missing
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RAC_ProductCampaign" (
    id TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    "pixelId" TEXT,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "paidCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_ProductCampaign_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "RAC_ProductCampaign_productId_idx"
ON "RAC_ProductCampaign" ("productId");

ALTER TABLE "RAC_ProductCampaign"
DROP CONSTRAINT IF EXISTS "RAC_ProductCampaign_productId_fkey";
ALTER TABLE "RAC_ProductCampaign"
ADD CONSTRAINT "RAC_ProductCampaign_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "RAC_Product" ("id")
ON DELETE CASCADE ON UPDATE CASCADE;
