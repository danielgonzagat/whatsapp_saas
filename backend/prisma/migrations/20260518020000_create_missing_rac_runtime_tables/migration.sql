-- Create RAC runtime tables that are mapped in Prisma schema but absent
-- from fresh migrate-deploy databases. The earlier RAC rename migration used
-- ALTER TABLE IF EXISTS for legacy table names, so clean CI databases skipped
-- these tables entirely.

DO $$
BEGIN
    CREATE TYPE "MailboxProvider" AS ENUM ('GMAIL', 'MICROSOFT', 'IMAP_SMTP');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "MailboxProvider" ADD VALUE IF NOT EXISTS 'GMAIL';
ALTER TYPE "MailboxProvider" ADD VALUE IF NOT EXISTS 'MICROSOFT';
ALTER TYPE "MailboxProvider" ADD VALUE IF NOT EXISTS 'IMAP_SMTP';

DO $$
BEGIN
    CREATE TYPE "MailboxStatus" AS ENUM (
        'PENDING',
        'ACTIVE',
        'DISCONNECTED',
        'EXPIRED',
        'ERROR'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "MailboxStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "MailboxStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "MailboxStatus" ADD VALUE IF NOT EXISTS 'DISCONNECTED';
ALTER TYPE "MailboxStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "MailboxStatus" ADD VALUE IF NOT EXISTS 'ERROR';

CREATE TABLE IF NOT EXISTS "RAC_MailboxConnection" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    provider "MailboxProvider" NOT NULL,
    email TEXT NOT NULL,
    status "MailboxStatus" NOT NULL DEFAULT 'PENDING',
    "providerAccountId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecure" BOOLEAN NOT NULL DEFAULT TRUE,
    "imapUsername" TEXT,
    "imapPassword" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT TRUE,
    "smtpUsername" TEXT,
    "smtpPassword" TEXT,
    metadata JSONB,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_MailboxConnection_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_MailboxConnection_workspaceId_provider_email_key"
ON "RAC_MailboxConnection" ("workspaceId", provider, email);

CREATE INDEX IF NOT EXISTS "RAC_MailboxConnection_workspaceId_status_idx"
ON "RAC_MailboxConnection" ("workspaceId", status);

CREATE INDEX IF NOT EXISTS "RAC_MailboxConnection_workspaceId_provider_idx"
ON "RAC_MailboxConnection" ("workspaceId", provider);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RAC_MailboxConnection_workspaceId_fkey'
    ) THEN
        ALTER TABLE "RAC_MailboxConnection"
        ADD CONSTRAINT "RAC_MailboxConnection_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace" (id)
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RAC_MemberEnrollment" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberAreaId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "studentPhone" TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    progress DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_MemberEnrollment_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS "RAC_MemberEnrollment_workspaceId_idx"
ON "RAC_MemberEnrollment" ("workspaceId");

CREATE INDEX IF NOT EXISTS "RAC_MemberEnrollment_memberAreaId_idx"
ON "RAC_MemberEnrollment" ("memberAreaId");

CREATE INDEX IF NOT EXISTS "RAC_MemberEnrollment_studentEmail_idx"
ON "RAC_MemberEnrollment" ("studentEmail");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RAC_MemberEnrollment_memberAreaId_fkey'
    ) THEN
        ALTER TABLE "RAC_MemberEnrollment"
        ADD CONSTRAINT "RAC_MemberEnrollment_memberAreaId_fkey"
        FOREIGN KEY ("memberAreaId") REFERENCES "RAC_MemberArea" (id)
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RAC_AdAccount" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    platform TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    status TEXT NOT NULL DEFAULT 'connected',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_AdAccount_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_AdAccount_workspaceId_platform_accountId_key"
ON "RAC_AdAccount" ("workspaceId", platform, "accountId");

CREATE INDEX IF NOT EXISTS "RAC_AdAccount_workspaceId_idx"
ON "RAC_AdAccount" ("workspaceId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RAC_AdAccount_workspaceId_fkey'
    ) THEN
        ALTER TABLE "RAC_AdAccount"
        ADD CONSTRAINT "RAC_AdAccount_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace" (id)
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RAC_AdCampaign" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    platform TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    status TEXT,
    spend DOUBLE PRECISION NOT NULL DEFAULT 0,
    revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
    roas DOUBLE PRECISION NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
    cpc DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_AdCampaign_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_AdCampaign_workspaceId_platform_campaignId_key"
ON "RAC_AdCampaign" ("workspaceId", platform, "campaignId");

CREATE INDEX IF NOT EXISTS "RAC_AdCampaign_workspaceId_platform_idx"
ON "RAC_AdCampaign" ("workspaceId", platform);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RAC_AdCampaign_workspaceId_fkey'
    ) THEN
        ALTER TABLE "RAC_AdCampaign"
        ADD CONSTRAINT "RAC_AdCampaign_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace" (id)
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RAC_AdInsight" (
    id TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    platform TEXT NOT NULL,
    date TIMESTAMP(3) NOT NULL,
    spend DOUBLE PRECISION NOT NULL DEFAULT 0,
    revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
    roas DOUBLE PRECISION NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
    cpc DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_AdInsight_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "RAC_AdInsight_workspaceId_platform_accountId_date_key"
ON "RAC_AdInsight" ("workspaceId", platform, "accountId", date);

CREATE INDEX IF NOT EXISTS "RAC_AdInsight_workspaceId_platform_date_idx"
ON "RAC_AdInsight" ("workspaceId", platform, date);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RAC_AdInsight_workspaceId_fkey'
    ) THEN
        ALTER TABLE "RAC_AdInsight"
        ADD CONSTRAINT "RAC_AdInsight_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace" (id)
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
