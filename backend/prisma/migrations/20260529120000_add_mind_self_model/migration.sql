-- MindSelfModel: versioned, append-only self-model timeline.
-- ADDITIVE migration. Creates a new table only — no destructive change to any
-- existing table. Rows are append-only at the application layer (one version
-- per workspace per snapshot cycle). NOT YET APPLIED — left for human review;
-- do NOT run prisma db push / migrate deploy from autonomous execution.

CREATE TABLE IF NOT EXISTS "RAC_MindSelfModel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "beliefsAboutSelf" JSONB NOT NULL,
    "decisionPatterns" JSONB NOT NULL,
    "knownLimits" JSONB NOT NULL,
    "contradictions" JSONB NOT NULL DEFAULT '[]',
    "derivedFrom" JSONB NOT NULL DEFAULT '{}',
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_MindSelfModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_MindSelfModel_workspaceId_version_key"
    ON "RAC_MindSelfModel"("workspaceId", "version");

CREATE INDEX IF NOT EXISTS "RAC_MindSelfModel_workspaceId_snapshotAt_idx"
    ON "RAC_MindSelfModel"("workspaceId", "snapshotAt" DESC);

-- FK to Workspace (CASCADE on delete) — mirrors every other RAC_Mind* table.
DO $$
BEGIN
    IF to_regclass('"Workspace"') IS NOT NULL THEN
        ALTER TABLE "RAC_MindSelfModel"
        ADD CONSTRAINT "RAC_MindSelfModel_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
