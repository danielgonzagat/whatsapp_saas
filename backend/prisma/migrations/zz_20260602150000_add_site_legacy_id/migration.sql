-- Adds the nullable legacy backfill key to RAC_Site after the existing
-- add-sites-domains-apps migration has created the Sites tables. Additive and
-- idempotent: NULL values do not collide under the unique index.

ALTER TABLE "RAC_Site" ADD COLUMN IF NOT EXISTS "legacyKloelSiteId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_Site_legacyKloelSiteId_key"
    ON "RAC_Site"("legacyKloelSiteId");
