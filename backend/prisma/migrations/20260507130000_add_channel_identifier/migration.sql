-- Create ChannelIdentifier table for unified contact memory across channels
CREATE TABLE "RAC_ChannelIdentifier" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_ChannelIdentifier_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one identifier per channel per workspace
CREATE UNIQUE INDEX "RAC_ChannelIdentifier_workspaceId_channel_value_key"
    ON "RAC_ChannelIdentifier"("workspaceId", "channel", "value");

-- Lookup index by contact
CREATE INDEX "RAC_ChannelIdentifier_contactId_idx"
    ON "RAC_ChannelIdentifier"("contactId");

-- Foreign keys
ALTER TABLE "RAC_ChannelIdentifier"
    ADD CONSTRAINT "RAC_ChannelIdentifier_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "RAC_Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RAC_ChannelIdentifier"
    ADD CONSTRAINT "RAC_ChannelIdentifier_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: create ChannelIdentifier rows for all existing contacts.
-- WhatsApp contacts: phone starts with digit or +
INSERT INTO "RAC_ChannelIdentifier" ("id", "channel", "value", "contactId", "workspaceId", "isPrimary", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    'WHATSAPP',
    "phone",
    "id",
    "workspaceId",
    true,
    NOW(),
    NOW()
FROM "RAC_Contact"
WHERE "phone" ~ '^[0-9+]';

-- Instagram contacts: phone starts with 'ig:'
INSERT INTO "RAC_ChannelIdentifier" ("id", "channel", "value", "contactId", "workspaceId", "isPrimary", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    'INSTAGRAM',
    substring("phone" from 4),
    "id",
    "workspaceId",
    true,
    NOW(),
    NOW()
FROM "RAC_Contact"
WHERE "phone" LIKE 'ig:%';

-- Messenger contacts: phone starts with 'fb:'
INSERT INTO "RAC_ChannelIdentifier" ("id", "channel", "value", "contactId", "workspaceId", "isPrimary", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    'MESSENGER',
    substring("phone" from 4),
    "id",
    "workspaceId",
    true,
    NOW(),
    NOW()
FROM "RAC_Contact"
WHERE "phone" LIKE 'fb:%';

-- Remaining contacts (email, other): store as-is under channel identified by prefix
INSERT INTO "RAC_ChannelIdentifier" ("id", "channel", "value", "contactId", "workspaceId", "isPrimary", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    CASE
        WHEN "phone" LIKE '%@%' THEN 'EMAIL'
        ELSE 'WHATSAPP'
    END,
    "phone",
    "id",
    "workspaceId",
    true,
    NOW(),
    NOW()
FROM "RAC_Contact"
WHERE "phone" NOT LIKE 'ig:%'
  AND "phone" NOT LIKE 'fb:%'
  AND "phone" !~ '^[0-9+]';
