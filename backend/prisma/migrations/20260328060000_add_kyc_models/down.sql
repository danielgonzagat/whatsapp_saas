-- Rollback: 20260328060000_add_kyc_models
-- Reverses: KYC columns on Agent, CreateTable KycDocument + FiscalData

-- Drop foreign keys
ALTER TABLE "KycDocument" DROP CONSTRAINT IF EXISTS "KycDocument_agentId_fkey";

-- Drop indexes
DROP INDEX IF EXISTS "FiscalData_workspaceId_idx";
DROP INDEX IF EXISTS "FiscalData_workspaceId_key";
DROP INDEX IF EXISTS "KycDocument_agentId_idx";
DROP INDEX IF EXISTS "KycDocument_workspaceId_idx";

-- Drop tables
DROP TABLE IF EXISTS "FiscalData";
DROP TABLE IF EXISTS "KycDocument";

-- Remove KYC columns from Agent
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "birthDate";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "documentType";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "documentNumber";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "kycStatus";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "kycSubmittedAt";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "kycApprovedAt";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "kycRejectedReason";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "publicName";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "bio";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "website";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "instagram";
