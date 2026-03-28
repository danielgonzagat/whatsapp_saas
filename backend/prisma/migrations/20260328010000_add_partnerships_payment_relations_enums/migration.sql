-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PAUSED', 'CANCELLED');
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');
CREATE TYPE "FlowExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'WAITING_INPUT');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'PENDING', 'SNOOZED');
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');

-- AlterTable: Add displayRole to Agent
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "displayRole" TEXT NOT NULL DEFAULT 'MEMBER';

-- AlterTable: Add updatedAt to KloelMessage
ALTER TABLE "KloelMessage" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- CreateTable: Payment
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalId" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "method" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CollaboratorInvite
CREATE TABLE IF NOT EXISTS "CollaboratorInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaboratorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AffiliatePartner
CREATE TABLE IF NOT EXISTS "AffiliatePartner" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "partnerEmail" TEXT NOT NULL,
    "partnerPhone" TEXT,
    "partnerWorkspaceId" TEXT,
    "type" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "commissionType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "temperature" INTEGER NOT NULL DEFAULT 0,
    "affiliateLink" TEXT,
    "affiliateCode" TEXT,
    "productIds" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PartnerMessage
CREATE TABLE IF NOT EXISTS "PartnerMessage" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_workspaceId_idx" ON "Payment"("workspaceId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_workspaceId_externalId_key" ON "Payment"("workspaceId", "externalId");

CREATE UNIQUE INDEX IF NOT EXISTS "CollaboratorInvite_token_key" ON "CollaboratorInvite"("token");
CREATE INDEX IF NOT EXISTS "CollaboratorInvite_workspaceId_idx" ON "CollaboratorInvite"("workspaceId");
CREATE INDEX IF NOT EXISTS "CollaboratorInvite_email_idx" ON "CollaboratorInvite"("email");
CREATE INDEX IF NOT EXISTS "CollaboratorInvite_token_idx" ON "CollaboratorInvite"("token");

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliatePartner_affiliateCode_key" ON "AffiliatePartner"("affiliateCode");
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliatePartner_workspaceId_partnerEmail_key" ON "AffiliatePartner"("workspaceId", "partnerEmail");
CREATE INDEX IF NOT EXISTS "AffiliatePartner_workspaceId_status_idx" ON "AffiliatePartner"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "AffiliatePartner_workspaceId_type_idx" ON "AffiliatePartner"("workspaceId", "type");
CREATE INDEX IF NOT EXISTS "AffiliatePartner_affiliateCode_idx" ON "AffiliatePartner"("affiliateCode");

CREATE INDEX IF NOT EXISTS "PartnerMessage_partnerId_createdAt_idx" ON "PartnerMessage"("partnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaboratorInvite" ADD CONSTRAINT "CollaboratorInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliatePartner" ADD CONSTRAINT "AffiliatePartner_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerMessage" ADD CONSTRAINT "PartnerMessage_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add workspace relations for models that were missing them
-- These use IF NOT EXISTS patterns to be idempotent

-- Campaign: change status to enum (safe: default values match)
-- Note: Only doing this if the column type is still text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Campaign' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE "Campaign" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Campaign" ALTER COLUMN "status" TYPE "CampaignStatus" USING "status"::"CampaignStatus";
    ALTER TABLE "Campaign" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
  END IF;
END $$;

-- Deal: change status to enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Deal' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE "Deal" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Deal" ALTER COLUMN "status" TYPE "DealStatus" USING "status"::"DealStatus";
    ALTER TABLE "Deal" ALTER COLUMN "status" SET DEFAULT 'OPEN';
  END IF;
END $$;

-- FlowExecution: change status to enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'FlowExecution' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE "FlowExecution" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "FlowExecution" ALTER COLUMN "status" TYPE "FlowExecutionStatus" USING "status"::"FlowExecutionStatus";
    ALTER TABLE "FlowExecution" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;
