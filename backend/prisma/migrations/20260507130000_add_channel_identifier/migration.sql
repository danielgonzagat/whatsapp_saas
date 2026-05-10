-- Create ChannelIdentifier table for unified contact memory across channels
CREATE UNIQUE INDEX IF NOT EXISTS "RAC_Contact_id_workspaceId_key"
ON "RAC_Contact" (id, "workspaceId");

CREATE TABLE "RAC_ChannelIdentifier" (
    id TEXT NOT NULL,
    channel TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    metadata JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_ChannelIdentifier_pkey" PRIMARY KEY (id)
);

ALTER TABLE "RAC_ChannelIdentifier"
ADD CONSTRAINT "RAC_ChannelIdentifier_contactId_fkey"
FOREIGN KEY ("contactId", "workspaceId") REFERENCES "RAC_Contact" (id, "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RAC_ChannelIdentifier"
ADD CONSTRAINT "RAC_ChannelIdentifier_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace" (id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint: one identifier per channel per workspace
CREATE UNIQUE INDEX "RAC_ChannelIdentifier_workspaceId_channel_value_key"
ON "RAC_ChannelIdentifier" ("workspaceId", channel, "value");

-- Lookup index by contact
CREATE INDEX "RAC_ChannelIdentifier_contactId_idx"
ON "RAC_ChannelIdentifier" ("contactId");

-- Backfill: create ChannelIdentifier rows for all existing contacts.
-- WhatsApp contacts: phone starts with digit or +
INSERT INTO "RAC_ChannelIdentifier" (
    id,
    channel,
    "value",
    "contactId",
    "workspaceId",
    "isPrimary",
    "createdAt",
    "updatedAt"
)
SELECT /* RAC_Contact */
    GEN_RANDOM_UUID()::TEXT AS generated_id,
    'WHATSAPP' AS channel_name,
    phone AS identifier_value,
    id AS contact_id,
    "workspaceId" AS workspace_id,
    true AS primary_flag,
    NOW() AS created_at,
    NOW() AS updated_at
FROM "RAC_Contact"
WHERE phone ~ '^[0-9+]'
ON CONFLICT ("workspaceId", channel, "value") DO NOTHING;

-- Instagram contacts: phone starts with 'ig:'
INSERT INTO "RAC_ChannelIdentifier" (
    id,
    channel,
    "value",
    "contactId",
    "workspaceId",
    "isPrimary",
    "createdAt",
    "updatedAt"
)
SELECT /* RAC_Contact */
    GEN_RANDOM_UUID()::TEXT AS generated_id,
    'INSTAGRAM' AS channel_name,
    SUBSTRING(phone FROM 4) AS identifier_value,
    id AS contact_id,
    "workspaceId" AS workspace_id,
    true AS primary_flag,
    NOW() AS created_at,
    NOW() AS updated_at
FROM "RAC_Contact"
WHERE phone LIKE 'ig:%'
ON CONFLICT ("workspaceId", channel, "value") DO NOTHING;

-- Messenger contacts: phone starts with 'fb:'
INSERT INTO "RAC_ChannelIdentifier" (
    id,
    channel,
    "value",
    "contactId",
    "workspaceId",
    "isPrimary",
    "createdAt",
    "updatedAt"
)
SELECT /* RAC_Contact */
    GEN_RANDOM_UUID()::TEXT AS generated_id,
    'MESSENGER' AS channel_name,
    SUBSTRING(phone FROM 4) AS identifier_value,
    id AS contact_id,
    "workspaceId" AS workspace_id,
    true AS primary_flag,
    NOW() AS created_at,
    NOW() AS updated_at
FROM "RAC_Contact"
WHERE phone LIKE 'fb:%'
ON CONFLICT ("workspaceId", channel, "value") DO NOTHING;

-- Remaining contacts: store as-is under channel identified by prefix.
INSERT INTO "RAC_ChannelIdentifier" (
    id,
    channel,
    "value",
    "contactId",
    "workspaceId",
    "isPrimary",
    "createdAt",
    "updatedAt"
)
SELECT /* RAC_Contact */
    GEN_RANDOM_UUID()::TEXT AS generated_id,
    CASE
        WHEN phone LIKE '%@%' THEN 'EMAIL'
        ELSE 'WHATSAPP'
    END AS channel_name,
    phone AS identifier_value,
    id AS contact_id,
    "workspaceId" AS workspace_id,
    true AS primary_flag,
    NOW() AS created_at,
    NOW() AS updated_at
FROM "RAC_Contact"
WHERE
    phone NOT LIKE 'ig:%'
    AND phone NOT LIKE 'fb:%'
    AND phone !~ '^[0-9+]'
ON CONFLICT ("workspaceId", channel, "value") DO NOTHING;
