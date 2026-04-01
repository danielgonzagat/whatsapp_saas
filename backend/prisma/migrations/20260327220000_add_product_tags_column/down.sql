-- Rollback: 20260327220000_add_product_tags_column
-- Reverses: Adding tags column to Product

ALTER TABLE "Product" DROP COLUMN IF EXISTS "tags";
