-- PERSON migration PHASE 0 — PURE ADDITIVE schema columns.
--
-- Adds nullable funnel-snapshot columns to RAC_Contact. NO data move, NO drop,
-- NO rename, NO type change, NO behavior change. Every statement is additive
-- and safe to apply to a populated production table:
--   * nullable TEXT columns      -> instant metadata-only add, no rewrite
--   * INTEGER NOT NULL DEFAULT 0 -> PG 11+ adds the default without a table rewrite
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
