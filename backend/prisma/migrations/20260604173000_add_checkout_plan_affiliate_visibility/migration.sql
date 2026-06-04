-- AlterTable
ALTER TABLE "RAC_CheckoutProductPlan"
ADD COLUMN IF NOT EXISTS "visibleToAffiliates" BOOLEAN NOT NULL DEFAULT true;
