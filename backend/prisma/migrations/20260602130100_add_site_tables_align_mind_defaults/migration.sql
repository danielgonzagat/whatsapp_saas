-- Adds the Sites/Builder persistence tables (RAC_Site, RAC_SiteDomain,
-- RAC_SiteAppIntegration) + their enums, which existed in schema.prisma but had
-- no migration, so GET /sites and the whole Sites feature crashed with 500
-- ("The table public.RAC_Site does not exist"). Also drops two stale column
-- defaults on RAC_MindBelief/RAC_MindPrediction.updatedAt to match the schema
-- (@updatedAt has no DB default). Fully additive — no table/column is dropped.

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DnsStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "RAC_MindBelief" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RAC_MindPrediction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RAC_Site" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "template" TEXT,
    "content" JSONB NOT NULL DEFAULT '{}',
    "seoMeta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "RAC_Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RAC_SiteDomain" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "dnsStatus" "DnsStatus" NOT NULL DEFAULT 'PENDING',
    "sslStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_SiteDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RAC_SiteAppIntegration" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "appKey" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_SiteAppIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RAC_Site_workspaceId_idx" ON "RAC_Site"("workspaceId");

-- CreateIndex
CREATE INDEX "RAC_Site_workspaceId_status_idx" ON "RAC_Site"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RAC_Site_workspaceId_slug_key" ON "RAC_Site"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "RAC_SiteDomain_hostname_key" ON "RAC_SiteDomain"("hostname");

-- CreateIndex
CREATE INDEX "RAC_SiteDomain_siteId_idx" ON "RAC_SiteDomain"("siteId");

-- CreateIndex
CREATE INDEX "RAC_SiteAppIntegration_siteId_idx" ON "RAC_SiteAppIntegration"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "RAC_SiteAppIntegration_siteId_appKey_key" ON "RAC_SiteAppIntegration"("siteId", "appKey");

-- AddForeignKey
ALTER TABLE "RAC_Site" ADD CONSTRAINT "RAC_Site_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RAC_SiteDomain" ADD CONSTRAINT "RAC_SiteDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "RAC_Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RAC_SiteAppIntegration" ADD CONSTRAINT "RAC_SiteAppIntegration_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "RAC_Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
