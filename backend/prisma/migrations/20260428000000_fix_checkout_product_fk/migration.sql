/*
  Fix FK drift: CheckoutProductPlan had FK to PhysicalProduct
  (orphaned table), but schema expects FK to Product (mapped to
  RAC_Product).

  Production was bootstrapped via `prisma db push` so the FK was
  already correct. Staging/CI databases created via `migrate deploy`
  have the stale FK.

  This migration:
    1. Drops the FK from RAC_CheckoutProductPlan to PhysicalProduct
    2. Creates the correct FK to RAC_Product
*/
ALTER TABLE "RAC_CheckoutProductPlan"
    DROP CONSTRAINT IF EXISTS "CheckoutProductPlan_productId_fkey";

ALTER TABLE "RAC_CheckoutProductPlan"
    ADD CONSTRAINT "RAC_CheckoutProductPlan_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "RAC_Product" ("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
