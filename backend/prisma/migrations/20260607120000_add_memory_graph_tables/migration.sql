-- Track m3-memory-graph: per-USER typed memory graph (supermemory/Mem0 in-repo equivalent).
--
-- ADDITIVE migration. Creates two new tables only (RAC_MemoryNode, RAC_MemoryEdge).
-- NO destructive change to any existing table — no rename, no drop, no column/type
-- change on any legacy table. Distinct from the per-WORKSPACE RAC_MindGraphNode /
-- RAC_MindGraphEdge Hebbian outcome graph: these are per-user, typed, embedded.
--
-- NOT YET APPLIED — left for human review. Do NOT run `prisma db push` /
-- `prisma migrate deploy` from autonomous execution.

-- pgvector is already enabled by the baseline migration; guard re-creation.
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- RAC_MemoryNode — typed per-user memory node with optional embedding
-- ============================================================
CREATE TABLE IF NOT EXISTS "RAC_MemoryNode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'user',
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "recency" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "embedding" vector(1536),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "forgotten" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "RAC_MemoryNode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RAC_MemoryNode_workspaceId_userId_type_idx"
    ON "RAC_MemoryNode"("workspaceId", "userId", "type");

CREATE INDEX IF NOT EXISTS "RAC_MemoryNode_workspaceId_userId_importance_idx"
    ON "RAC_MemoryNode"("workspaceId", "userId", "importance");

-- ============================================================
-- RAC_MemoryEdge — typed edge between two RAC_MemoryNode rows
-- ============================================================
CREATE TABLE IF NOT EXISTS "RAC_MemoryEdge" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_MemoryEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_MemoryEdge_workspaceId_fromId_relation_toId_key"
    ON "RAC_MemoryEdge"("workspaceId", "fromId", "relation", "toId");

CREATE INDEX IF NOT EXISTS "RAC_MemoryEdge_workspaceId_relation_idx"
    ON "RAC_MemoryEdge"("workspaceId", "relation");

-- ============================================================
-- FKs — Workspace (CASCADE) on both tables, node→node on edges (CASCADE).
-- Guarded so the migration is safe even if applied out of order.
-- ============================================================
DO $$
BEGIN
    IF to_regclass('"RAC_Workspace"') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'RAC_MemoryNode_workspaceId_fkey'
        ) THEN
            ALTER TABLE "RAC_MemoryNode"
            ADD CONSTRAINT "RAC_MemoryNode_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'RAC_MemoryEdge_workspaceId_fkey'
        ) THEN
            ALTER TABLE "RAC_MemoryEdge"
            ADD CONSTRAINT "RAC_MemoryEdge_workspaceId_fkey"
            FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RAC_MemoryEdge_fromId_fkey'
    ) THEN
        ALTER TABLE "RAC_MemoryEdge"
        ADD CONSTRAINT "RAC_MemoryEdge_fromId_fkey"
        FOREIGN KEY ("fromId") REFERENCES "RAC_MemoryNode"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RAC_MemoryEdge_toId_fkey'
    ) THEN
        ALTER TABLE "RAC_MemoryEdge"
        ADD CONSTRAINT "RAC_MemoryEdge_toId_fkey"
        FOREIGN KEY ("toId") REFERENCES "RAC_MemoryNode"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
