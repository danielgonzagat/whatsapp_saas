-- Create RAC_AdRule table.
-- The AdRule model exists in schema.prisma with @@map("RAC_AdRule")
-- but was never created by a CreateTable migration (only referenced
-- as a no-op rename target in 20260425013841_rac_table_rename via
-- ALTER TABLE IF EXISTS, which silently skips fresh databases). This
-- forward-only migration creates the final RAC_AdRule shape.

CREATE TABLE IF NOT EXISTS "RAC_AdRule" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    name TEXT NOT NULL,
    condition TEXT NOT NULL,
    action TEXT NOT NULL,
    "alertMethod" TEXT,
    "alertTarget" TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_AdRule_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "RAC_AdRule_workspaceId_idx"
ON "RAC_AdRule" ("workspaceId");
