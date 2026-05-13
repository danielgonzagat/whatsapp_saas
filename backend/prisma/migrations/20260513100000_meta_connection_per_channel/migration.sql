-- Backfill existing NULL channels before enforcing NOT NULL
UPDATE "RAC_MetaConnection" SET "channel" = 'whatsapp'
WHERE "channel" IS NULL;

-- Enforce channel NOT NULL
ALTER TABLE "RAC_MetaConnection" ALTER COLUMN "channel" SET NOT NULL;

-- Drop the old unique index on workspaceId alone
DROP INDEX IF EXISTS "MetaConnection_workspaceId_key";

-- Add per-channel compound unique constraint
CREATE UNIQUE INDEX "RAC_MetaConnection_workspaceId_channel_key" ON "RAC_MetaConnection" ("workspaceId", "channel");
