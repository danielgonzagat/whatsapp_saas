-- Aligns stale updatedAt defaults on RAC_MindBelief/RAC_MindPrediction with
-- schema.prisma (@updatedAt has no DB default). Sites/Builder tables are
-- created by the existing add-sites-domains-apps migration.

-- AlterTable
ALTER TABLE "RAC_MindBelief" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RAC_MindPrediction" ALTER COLUMN "updatedAt" DROP DEFAULT;
