ALTER TABLE "RAC_MindBelief"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE "RAC_MindBelief"
  SET "updatedAt" = "lastUpdate"
  WHERE "updatedAt" IS NOT NULL;

ALTER TABLE "RAC_MindPrediction"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE "RAC_MindPrediction"
  SET "updatedAt" = "createdAt"
  WHERE "updatedAt" IS NOT NULL;

ALTER TABLE "RAC_MindPolicy"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE "RAC_MindPolicy"
  SET "updatedAt" = COALESCE("resolvedAt", "createdAt")
  WHERE "updatedAt" IS NOT NULL;
