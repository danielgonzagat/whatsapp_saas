DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckoutSocialProvider') THEN
    CREATE TYPE "CheckoutSocialProvider" AS ENUM ('GOOGLE', 'FACEBOOK', 'APPLE');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckoutSocialLeadStatus') THEN
    CREATE TYPE "CheckoutSocialLeadStatus" AS ENUM ('CAPTURED', 'ENRICHED', 'ABANDONED', 'CONVERTED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckoutSocialLeadEnrichmentStatus') THEN
    CREATE TYPE "CheckoutSocialLeadEnrichmentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "CheckoutSocialLead" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "checkoutSlug" TEXT NOT NULL,
  "checkoutCode" TEXT,
  "provider" "CheckoutSocialProvider" NOT NULL,
  "providerId" TEXT,
  "providerEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT,
  "email" TEXT,
  "avatarUrl" TEXT,
  "phone" TEXT,
  "cpf" TEXT,
  "status" "CheckoutSocialLeadStatus" NOT NULL DEFAULT 'CAPTURED',
  "stepReached" INTEGER NOT NULL DEFAULT 1,
  "sourceUrl" TEXT,
  "refererUrl" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "utmTerm" TEXT,
  "fbclid" TEXT,
  "gclid" TEXT,
  "deviceFingerprint" TEXT,
  "providerPayload" JSONB,
  "enrichmentData" JSONB,
  "enrichmentStatus" "CheckoutSocialLeadEnrichmentStatus" NOT NULL DEFAULT 'PENDING',
  "enrichedAt" TIMESTAMP(3),
  "abandonedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "recoveryWhatsAppSentAt" TIMESTAMP(3),
  "recoveryEmailSentAt" TIMESTAMP(3),
  "convertedOrderId" TEXT,
  "contactId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutSocialLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CheckoutSocialLead_workspaceId_createdAt_idx"
ON "CheckoutSocialLead"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "CheckoutSocialLead_workspaceId_status_createdAt_idx"
ON "CheckoutSocialLead"("workspaceId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "CheckoutSocialLead_workspaceId_email_idx"
ON "CheckoutSocialLead"("workspaceId", "email");

CREATE INDEX IF NOT EXISTS "CheckoutSocialLead_workspaceId_phone_idx"
ON "CheckoutSocialLead"("workspaceId", "phone");

CREATE INDEX IF NOT EXISTS "CheckoutSocialLead_workspaceId_deviceFingerprint_idx"
ON "CheckoutSocialLead"("workspaceId", "deviceFingerprint");

CREATE INDEX IF NOT EXISTS "CheckoutSocialLead_planId_createdAt_idx"
ON "CheckoutSocialLead"("planId", "createdAt");

CREATE INDEX IF NOT EXISTS "CheckoutSocialLead_productId_createdAt_idx"
ON "CheckoutSocialLead"("productId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CheckoutSocialLead_workspaceId_fkey'
  ) THEN
    ALTER TABLE "CheckoutSocialLead"
    ADD CONSTRAINT "CheckoutSocialLead_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CheckoutSocialLead_planId_fkey'
  ) THEN
    ALTER TABLE "CheckoutSocialLead"
    ADD CONSTRAINT "CheckoutSocialLead_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "CheckoutProductPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CheckoutSocialLead_productId_fkey'
  ) THEN
    ALTER TABLE "CheckoutSocialLead"
    ADD CONSTRAINT "CheckoutSocialLead_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CheckoutSocialLead_convertedOrderId_fkey'
  ) THEN
    ALTER TABLE "CheckoutSocialLead"
    ADD CONSTRAINT "CheckoutSocialLead_convertedOrderId_fkey"
    FOREIGN KEY ("convertedOrderId") REFERENCES "CheckoutOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CheckoutSocialLead_contactId_fkey'
  ) THEN
    ALTER TABLE "CheckoutSocialLead"
    ADD CONSTRAINT "CheckoutSocialLead_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
