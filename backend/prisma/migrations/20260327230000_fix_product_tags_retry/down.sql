-- Rollback: 20260327230000_fix_product_tags_retry
-- Reverses: Adding tags column to Product (retry of previous migration)

ALTER TABLE "Product" DROP COLUMN IF EXISTS "tags";
