-- Brain → Mind unification PR-1: canonical message + memory stores.
-- See docs/architecture/BRAIN_MIND_UNIFICATION_PLAN.md §5 (PR-1).
--
-- ADDITIVE migration. Creates two new tables only (RAC_MindMessage,
-- RAC_MindMemory) that mirror the column shape of RAC_KloelMessage /
-- RAC_KloelMemory so MindCanonicalService can dual-write into the canonical
-- surface later. NO destructive change to any existing table — no rename, no
-- drop, no column/type change on the legacy Kloel* tables.
--
-- NOT YET APPLIED — left for human review. Do NOT run
-- `prisma db push` / `prisma migrate deploy` from autonomous execution.

-- ============================================================
-- RAC_MindMessage — mirrors RAC_KloelMessage (+ `source` discriminator)
-- ============================================================
CREATE TABLE IF NOT EXISTS "RAC_MindMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'brain',
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_MindMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RAC_MindMessage_workspaceId_createdAt_idx"
    ON "RAC_MindMessage"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "RAC_MindMessage_workspaceId_source_createdAt_idx"
    ON "RAC_MindMessage"("workspaceId", "source", "createdAt");

-- ============================================================
-- RAC_MindMemory — mirrors RAC_KloelMemory (+ `namespace` partition)
-- ============================================================
CREATE TABLE IF NOT EXISTS "RAC_MindMemory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'default',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "type" TEXT,
    "content" TEXT,
    "metadata" JSONB,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_MindMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_MindMemory_workspaceId_namespace_key_key"
    ON "RAC_MindMemory"("workspaceId", "namespace", "key");

CREATE INDEX IF NOT EXISTS "RAC_MindMemory_workspaceId_category_idx"
    ON "RAC_MindMemory"("workspaceId", "category");

-- ============================================================
-- FKs to Workspace (CASCADE on delete) — mirrors every other RAC_Mind* table.
-- Guarded so the migration is safe even if applied out of order.
-- ============================================================
DO $$
BEGIN
    IF to_regclass('"RAC_Workspace"') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'RAC_MindMessage_workspaceId_fkey'
        ) THEN
            ALTER TABLE "RAC_MindMessage"
            ADD CONSTRAINT "RAC_MindMessage_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'RAC_MindMemory_workspaceId_fkey'
        ) THEN
            ALTER TABLE "RAC_MindMemory"
            ADD CONSTRAINT "RAC_MindMemory_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
    END IF;
END $$;
