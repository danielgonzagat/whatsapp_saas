-- Rollback: 20260320183000_account_agency_canonical_models
-- Reverses: AgentWorkItem, ApprovalRequest, InputCollectionSession,
--           AccountProofSnapshot, ConversationProofSnapshot tables
--           and extra columns on AutonomyExecution

-- Drop foreign keys
ALTER TABLE "ConversationProofSnapshot" DROP CONSTRAINT IF EXISTS "ConversationProofSnapshot_workspaceId_fkey";
ALTER TABLE "AccountProofSnapshot" DROP CONSTRAINT IF EXISTS "AccountProofSnapshot_workspaceId_fkey";
ALTER TABLE "InputCollectionSession" DROP CONSTRAINT IF EXISTS "InputCollectionSession_workspaceId_fkey";
ALTER TABLE "ApprovalRequest" DROP CONSTRAINT IF EXISTS "ApprovalRequest_workspaceId_fkey";
ALTER TABLE "AgentWorkItem" DROP CONSTRAINT IF EXISTS "AgentWorkItem_workspaceId_fkey";

-- Drop tables
DROP TABLE IF EXISTS "ConversationProofSnapshot";
DROP TABLE IF EXISTS "AccountProofSnapshot";
DROP TABLE IF EXISTS "InputCollectionSession";
DROP TABLE IF EXISTS "ApprovalRequest";
DROP TABLE IF EXISTS "AgentWorkItem";

-- Remove added columns from AutonomyExecution
ALTER TABLE "AutonomyExecution" DROP COLUMN IF EXISTS "workItemId";
ALTER TABLE "AutonomyExecution" DROP COLUMN IF EXISTS "proofId";
ALTER TABLE "AutonomyExecution" DROP COLUMN IF EXISTS "capabilityCode";
ALTER TABLE "AutonomyExecution" DROP COLUMN IF EXISTS "tacticCode";
