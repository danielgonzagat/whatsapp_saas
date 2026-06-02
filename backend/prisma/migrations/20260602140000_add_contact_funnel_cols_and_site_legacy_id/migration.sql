-- PERSON+SITE migration PHASE 0 — PURE ADDITIVE schema columns.
--
-- Adds nullable funnel-snapshot columns to RAC_Contact and a nullable unique
-- legacy backfill key to RAC_Site. NO data move, NO drop, NO rename, NO type
-- change, NO behavior change. Every statement is additive and safe to apply to
-- a populated production table:
--   * nullable TEXT columns      -> instant metadata-only add, no rewrite
--   * INTEGER NOT NULL DEFAULT 0 -> PG 11+ adds the default without a table rewrite
--   * UNIQUE INDEX on a nullable  -> NULLs are not considered equal, so existing
--     rows (all NULL) never collide
--
-- Guarded with IF NOT EXISTS for idempotency / out-of-order safety.

-- ============================================================
-- RAC_Contact: lead funnel snapshot columns (additive, nullable + one counter).
-- ============================================================
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "leadStatus" TEXT;
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "leadStage" TEXT;
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "lastMessage" TEXT;
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "lastIntent" TEXT;
ALTER TABLE "RAC_Contact" ADD COLUMN IF NOT EXISTS "totalMessages" INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- RAC_Site: legacy backfill idempotency key (additive, nullable unique).
-- ============================================================
ALTER TABLE "RAC_Site" ADD COLUMN IF NOT EXISTS "legacyKloelSiteId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_Site_legacyKloelSiteId_key"
    ON "RAC_Site"("legacyKloelSiteId");
