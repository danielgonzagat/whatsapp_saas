-- Rollback: 20260328010000_add_partnerships_payment_relations_enums
-- Reverses: Payment, CollaboratorInvite, AffiliatePartner, PartnerMessage tables,
--           enum type changes for Campaign/Deal/FlowExecution/Conversation status,
--           and Agent.displayRole + KloelMessage.updatedAt columns

-- Drop foreign keys
ALTER TABLE "PartnerMessage" DROP CONSTRAINT IF EXISTS "PartnerMessage_partnerId_fkey";
ALTER TABLE "AffiliatePartner" DROP CONSTRAINT IF EXISTS "AffiliatePartner_workspaceId_fkey";
ALTER TABLE "CollaboratorInvite" DROP CONSTRAINT IF EXISTS "CollaboratorInvite_workspaceId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_workspaceId_fkey";

-- Drop tables
DROP TABLE IF EXISTS "PartnerMessage";
DROP TABLE IF EXISTS "AffiliatePartner";
DROP TABLE IF EXISTS "CollaboratorInvite";
DROP TABLE IF EXISTS "Payment";

-- Revert enum columns back to TEXT (reverse of the DO blocks)
-- FlowExecution.status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'FlowExecution' AND column_name = 'status' AND udt_name = 'FlowExecutionStatus'
  ) THEN
    ALTER TABLE "FlowExecution" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "FlowExecution" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
    ALTER TABLE "FlowExecution" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

-- Deal.status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Deal' AND column_name = 'status' AND udt_name = 'DealStatus'
  ) THEN
    ALTER TABLE "Deal" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Deal" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
    ALTER TABLE "Deal" ALTER COLUMN "status" SET DEFAULT 'OPEN';
  END IF;
END $$;

-- Campaign.status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Campaign' AND column_name = 'status' AND udt_name = 'CampaignStatus'
  ) THEN
    ALTER TABLE "Campaign" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Campaign" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
    ALTER TABLE "Campaign" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
  END IF;
END $$;

-- Drop enums created by this migration
DROP TYPE IF EXISTS "FlowExecutionStatus";
DROP TYPE IF EXISTS "DealStatus";
DROP TYPE IF EXISTS "CampaignStatus";
DROP TYPE IF EXISTS "ConversationStatus";
DROP TYPE IF EXISTS "MessageStatus";

-- Remove added columns
ALTER TABLE "KloelMessage" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "displayRole";
