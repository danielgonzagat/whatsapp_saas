-- Retry: Add tags column to Product (previous migration was resolved as applied but SQL never ran)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
