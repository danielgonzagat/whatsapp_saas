-- Complete RAC runtime schema for fresh CI databases.
-- Earlier migrations created the core MIND tables before the Prisma schema
-- gained these runtime columns, and OpsEvent was mapped but never created.

DO $$
BEGIN
    IF to_regclass('"RAC_MindPolicy"') IS NOT NULL THEN
        ALTER TABLE "RAC_MindPolicy"
        ADD COLUMN IF NOT EXISTS "calcSteps" JSONB;

        UPDATE "RAC_MindPolicy"
        SET "calcSteps" = '[]'::jsonb
        WHERE "calcSteps" IS NULL;

        ALTER TABLE "RAC_MindPolicy"
        ALTER COLUMN "calcSteps" SET NOT NULL;

        ALTER TABLE "RAC_MindPolicy"
        ADD COLUMN IF NOT EXISTS epsilon DOUBLE PRECISION;

        UPDATE "RAC_MindPolicy"
        SET epsilon = 0
        WHERE epsilon IS NULL;

        ALTER TABLE "RAC_MindPolicy"
        ALTER COLUMN epsilon SET NOT NULL;

        ALTER TABLE "RAC_MindPolicy"
        ADD COLUMN IF NOT EXISTS "utilitySuccess" DOUBLE PRECISION;

        UPDATE "RAC_MindPolicy"
        SET "utilitySuccess" = 1
        WHERE "utilitySuccess" IS NULL;

        ALTER TABLE "RAC_MindPolicy"
        ALTER COLUMN "utilitySuccess" SET NOT NULL;

        ALTER TABLE "RAC_MindPolicy"
        ADD COLUMN IF NOT EXISTS "utilityFail" DOUBLE PRECISION;

        UPDATE "RAC_MindPolicy"
        SET "utilityFail" = 0
        WHERE "utilityFail" IS NULL;

        ALTER TABLE "RAC_MindPolicy"
        ALTER COLUMN "utilityFail" SET NOT NULL;

        ALTER TABLE "RAC_MindPolicy"
        ADD COLUMN IF NOT EXISTS "fallbackActive" BOOLEAN;

        UPDATE "RAC_MindPolicy"
        SET "fallbackActive" = FALSE
        WHERE "fallbackActive" IS NULL;

        ALTER TABLE "RAC_MindPolicy"
        ALTER COLUMN "fallbackActive" SET NOT NULL;

        ALTER TABLE "RAC_MindPolicy"
        ADD COLUMN IF NOT EXISTS "fallbackReason" TEXT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RAC_OpsEvent" (
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    service TEXT NOT NULL,
    error TEXT NOT NULL,
    stack TEXT,
    "workspaceId" TEXT,
    metadata JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_OpsEvent_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "RAC_OpsEvent_type_createdAt_idx"
ON "RAC_OpsEvent" (type, "createdAt");

CREATE INDEX IF NOT EXISTS "RAC_OpsEvent_service_createdAt_idx"
ON "RAC_OpsEvent" (service, "createdAt");

CREATE INDEX IF NOT EXISTS "RAC_OpsEvent_workspaceId_createdAt_idx"
ON "RAC_OpsEvent" ("workspaceId", "createdAt");
