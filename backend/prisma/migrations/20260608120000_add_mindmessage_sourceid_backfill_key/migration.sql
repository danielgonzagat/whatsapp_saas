-- Brain→Mind cutover, Phase 2 (backfill correlation key).
--
-- ADDITIVE + non-destructive: a nullable correlation column plus a unique index
-- that makes the RAC_KloelMessage → RAC_MindMessage backfill idempotent. Live
-- dual-written rows keep sourceId = NULL; Postgres treats NULLs as distinct in a
-- unique index, so existing rows and the live dual-write path are unaffected.
--
-- Apply deliberately (operator-staged) — NOT auto-run by this change.

ALTER TABLE "RAC_MindMessage" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_MindMessage_workspaceId_source_sourceId_key"
  ON "RAC_MindMessage" ("workspaceId", "source", "sourceId");
