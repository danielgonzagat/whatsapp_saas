-- CreateTable
-- Adds the RAC_MindSelfModel table that the MindSelfModel schema model maps to.
-- The model existed in schema.prisma but no migration ever created the table,
-- so MindProcessorService.snapshot() crashed every ~30s with
-- "The table public.RAC_MindSelfModel does not exist". Additive — no existing
-- table is altered or dropped.
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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RAC_MindSelfModel_workspaceId_snapshotAt_idx" ON "RAC_MindSelfModel"("workspaceId", "snapshotAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RAC_MindSelfModel_workspaceId_version_key" ON "RAC_MindSelfModel"("workspaceId", "version");

-- AddForeignKey
DO $$
BEGIN
    IF to_regclass('"RAC_Workspace"') IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'RAC_MindSelfModel_workspaceId_fkey'
        ) THEN
        ALTER TABLE "RAC_MindSelfModel"
        ADD CONSTRAINT "RAC_MindSelfModel_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
