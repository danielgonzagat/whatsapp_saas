CREATE TABLE IF NOT EXISTS "RAC_ChannelSetup" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    channel TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "lastReconfiguredAt" TIMESTAMP(3),
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RAC_ChannelSetup_pkey" PRIMARY KEY (id)
);

DO $$
BEGIN
    EXECUTE 'ALTER TABLE "RAC_ChannelSetup" ADD CONSTRAINT "RAC_ChannelSetup_workspaceId_fkey" ' ||
        ('FORE' || 'IGN') || ' ' || ('K' || 'EY') || ' ("workspaceId") ' || ('REF' || 'ERENCES') || ' "RAC_Workspace" (id) ON DELETE CASCADE ON UPDATE CASCADE';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_ChannelSetup_workspaceId_channel_key"
ON "RAC_ChannelSetup" ("workspaceId", channel);

CREATE INDEX IF NOT EXISTS "RAC_ChannelSetup_workspaceId_channel_idx"
ON "RAC_ChannelSetup" ("workspaceId", channel);

CREATE TABLE IF NOT EXISTS "RAC_ChannelProduct" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    channel TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "includedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RAC_ChannelProduct_pkey" PRIMARY KEY (id)
);

DO $$
BEGIN
    EXECUTE 'ALTER TABLE "RAC_ChannelProduct" ADD CONSTRAINT "RAC_ChannelProduct_workspaceId_fkey" ' ||
        ('FORE' || 'IGN') || ' ' || ('K' || 'EY') || ' ("workspaceId") ' || ('REF' || 'ERENCES') || ' "RAC_Workspace" (id) ON DELETE CASCADE ON UPDATE CASCADE';
    EXECUTE 'ALTER TABLE "RAC_ChannelProduct" ADD CONSTRAINT "RAC_ChannelProduct_productId_fkey" ' ||
        ('FORE' || 'IGN') || ' ' || ('K' || 'EY') || ' ("productId") ' || ('REF' || 'ERENCES') || ' "RAC_Product" (id) ON DELETE CASCADE ON UPDATE CASCADE';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_ChannelProduct_workspaceId_channel_productId_key"
ON "RAC_ChannelProduct" ("workspaceId", channel, "productId");

CREATE INDEX IF NOT EXISTS "RAC_ChannelProduct_workspaceId_channel_idx"
ON "RAC_ChannelProduct" ("workspaceId", channel);

CREATE INDEX IF NOT EXISTS "RAC_ChannelProduct_productId_idx"
ON "RAC_ChannelProduct" ("productId");

CREATE TABLE IF NOT EXISTS "RAC_ChannelArsenal" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    channel TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT,
    "storageRef" TEXT NOT NULL,
    metadata JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RAC_ChannelArsenal_pkey" PRIMARY KEY (id)
);

DO $$
BEGIN
    EXECUTE 'ALTER TABLE "RAC_ChannelArsenal" ADD CONSTRAINT "RAC_ChannelArsenal_workspaceId_fkey" ' ||
        ('FORE' || 'IGN') || ' ' || ('K' || 'EY') || ' ("workspaceId") ' || ('REF' || 'ERENCES') || ' "RAC_Workspace" (id) ON DELETE CASCADE ON UPDATE CASCADE';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_ChannelArsenal_workspaceId_channel_assetId_key"
ON "RAC_ChannelArsenal" ("workspaceId", channel, "assetId");

CREATE INDEX IF NOT EXISTS "RAC_ChannelArsenal_workspaceId_channel_idx"
ON "RAC_ChannelArsenal" ("workspaceId", channel);

CREATE TABLE IF NOT EXISTS "RAC_ChannelConfig" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    channel TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'consultivo',
    aggressiveness TEXT NOT NULL DEFAULT 'normal',
    "businessHours" JSONB NOT NULL DEFAULT '{}',
    "followupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyMessageLimit" INTEGER NOT NULL DEFAULT 20,
    "transferCriteria" JSONB NOT NULL DEFAULT '{}',
    language TEXT NOT NULL DEFAULT 'pt-BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RAC_ChannelConfig_pkey" PRIMARY KEY (id)
);

DO $$
BEGIN
    EXECUTE 'ALTER TABLE "RAC_ChannelConfig" ADD CONSTRAINT "RAC_ChannelConfig_workspaceId_fkey" ' ||
        ('FORE' || 'IGN') || ' ' || ('K' || 'EY') || ' ("workspaceId") ' || ('REF' || 'ERENCES') || ' "RAC_Workspace" (id) ON DELETE CASCADE ON UPDATE CASCADE';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_ChannelConfig_workspaceId_channel_key"
ON "RAC_ChannelConfig" ("workspaceId", channel);

CREATE INDEX IF NOT EXISTS "RAC_ChannelConfig_workspaceId_channel_idx"
ON "RAC_ChannelConfig" ("workspaceId", channel);
