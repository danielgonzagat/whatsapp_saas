-- Aligns the applied database schema with the current Prisma datamodel.
-- These fields/models were added to schema.prisma but were missing from the
-- committed migration history, which breaks fresh CI databases.

ALTER TABLE "CustomerSubscription"
ADD COLUMN IF NOT EXISTS "planId" TEXT,
ADD COLUMN IF NOT EXISTS "planChangedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "previousPlanId" TEXT;

CREATE TABLE IF NOT EXISTS "OrderAlert" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "orderId" TEXT,
  "severity" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderAlert_workspaceId_resolved_createdAt_idx"
ON "OrderAlert"("workspaceId", "resolved", "createdAt");

CREATE INDEX IF NOT EXISTS "OrderAlert_workspaceId_type_idx"
ON "OrderAlert"("workspaceId", "type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OrderAlert_workspaceId_fkey'
  ) THEN
    ALTER TABLE "OrderAlert"
    ADD CONSTRAINT "OrderAlert_workspaceId_fkey"
    FOREIGN KEY ("workspaceId")
    REFERENCES "Workspace"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END
$$;
