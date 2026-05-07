ALTER TABLE "RAC_MindBelief"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP;

UPDATE "RAC_MindBelief"
  SET "updatedAt" = "lastUpdate"
  WHERE "updatedAt" IS NULL;

ALTER TABLE "RAC_MindBelief"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();

ALTER TABLE "RAC_MindBelief"
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "RAC_MindPrediction"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP;

UPDATE "RAC_MindPrediction"
  SET "updatedAt" = "createdAt"
  WHERE "updatedAt" IS NULL;

ALTER TABLE "RAC_MindPrediction"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();

ALTER TABLE "RAC_MindPrediction"
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "RAC_MindPolicy"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP;

UPDATE "RAC_MindPolicy"
  SET "updatedAt" = COALESCE("resolvedAt", "createdAt")
  WHERE "updatedAt" IS NULL;

ALTER TABLE "RAC_MindPolicy"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();

ALTER TABLE "RAC_MindPolicy"
  ALTER COLUMN "updatedAt" SET NOT NULL;
