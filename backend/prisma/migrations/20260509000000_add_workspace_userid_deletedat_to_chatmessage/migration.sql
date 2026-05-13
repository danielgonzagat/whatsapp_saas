-- AlterTable
ALTER TABLE "RAC_ChatMessage" ADD COLUMN "workspaceId" TEXT;

-- Backfill workspaceId from parent ChatThread
UPDATE "RAC_ChatMessage" SET "workspaceId" = (
    SELECT "workspaceId" FROM "RAC_ChatThread"
    WHERE "RAC_ChatThread"."id" = "RAC_ChatMessage"."threadId"
);

-- Make workspaceId required after backfill
ALTER TABLE "RAC_ChatMessage" ALTER COLUMN "workspaceId" SET NOT NULL;

-- Add remaining columns
ALTER TABLE "RAC_ChatMessage" ADD COLUMN "userId" TEXT;
ALTER TABLE "RAC_ChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Create indexes
CREATE INDEX "RAC_ChatMessage_workspaceId_createdAt_idx" ON "RAC_ChatMessage" ("workspaceId", "createdAt");
CREATE INDEX "RAC_ChatMessage_userId_createdAt_idx" ON "RAC_ChatMessage" ("userId", "createdAt");
