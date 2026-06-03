ALTER TABLE "RAC_Agent"
  ADD COLUMN "mfa_secret" TEXT,
  ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfa_pending_setup" BOOLEAN NOT NULL DEFAULT false;
