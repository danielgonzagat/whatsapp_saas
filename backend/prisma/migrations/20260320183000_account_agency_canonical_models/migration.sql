ALTER TABLE "AutonomyExecution"
  ADD COLUMN IF NOT EXISTS "workItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "proofId" TEXT,
  ADD COLUMN IF NOT EXISTS "capabilityCode" TEXT,
  ADD COLUMN IF NOT EXISTS "tacticCode" TEXT;

CREATE TABLE IF NOT EXISTS "AgentWorkItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'OPEN',
  "owner" TEXT NOT NULL DEFAULT 'AGENT',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "utility" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "eligibleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedBy" JSONB,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "requiresInput" BOOLEAN NOT NULL DEFAULT false,
  "approvalState" TEXT,
  "inputState" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastTriedAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "evidence" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentWorkItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "scope" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "response" JSONB,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InputCollectionSession" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "prompt" TEXT,
  "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "payload" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InputCollectionSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AccountProofSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "proofType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "cycleProofId" TEXT,
  "noLegalActions" BOOLEAN NOT NULL DEFAULT false,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "eligibleActionCount" INTEGER NOT NULL DEFAULT 0,
  "blockedActionCount" INTEGER NOT NULL DEFAULT 0,
  "deferredActionCount" INTEGER NOT NULL DEFAULT 0,
  "waitingApprovalCount" INTEGER NOT NULL DEFAULT 0,
  "waitingInputCount" INTEGER NOT NULL DEFAULT 0,
  "silentRemainderCount" INTEGER NOT NULL DEFAULT 0,
  "workItemUniverse" JSONB,
  "actionUniverse" JSONB,
  "executedActions" JSONB,
  "blockedActions" JSONB,
  "deferredActions" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountProofSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConversationProofSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "contactId" TEXT,
  "phone" TEXT,
  "status" TEXT NOT NULL,
  "cycleProofId" TEXT,
  "accountProofId" TEXT,
  "selectedActionType" TEXT NOT NULL,
  "selectedTactic" TEXT,
  "governor" TEXT,
  "renderedMessage" TEXT,
  "outcome" TEXT,
  "actionUniverse" JSONB,
  "tacticUniverse" JSONB,
  "selectedAction" JSONB,
  "selectedTacticData" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationProofSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentWorkItem_workspaceId_kind_state_idx"
  ON "AgentWorkItem"("workspaceId", "kind", "state");

CREATE INDEX IF NOT EXISTS "AgentWorkItem_workspaceId_state_eligibleAt_idx"
  ON "AgentWorkItem"("workspaceId", "state", "eligibleAt");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_workspaceId_kind_state_idx"
  ON "ApprovalRequest"("workspaceId", "kind", "state");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_workspaceId_state_createdAt_idx"
  ON "ApprovalRequest"("workspaceId", "state", "createdAt");

CREATE INDEX IF NOT EXISTS "InputCollectionSession_workspaceId_kind_state_idx"
  ON "InputCollectionSession"("workspaceId", "kind", "state");

CREATE INDEX IF NOT EXISTS "InputCollectionSession_workspaceId_state_updatedAt_idx"
  ON "InputCollectionSession"("workspaceId", "state", "updatedAt");

CREATE INDEX IF NOT EXISTS "AccountProofSnapshot_workspaceId_createdAt_idx"
  ON "AccountProofSnapshot"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "AccountProofSnapshot_workspaceId_status_createdAt_idx"
  ON "AccountProofSnapshot"("workspaceId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "ConversationProofSnapshot_workspaceId_conversationId_createdAt_idx"
  ON "ConversationProofSnapshot"("workspaceId", "conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "ConversationProofSnapshot_workspaceId_status_createdAt_idx"
  ON "ConversationProofSnapshot"("workspaceId", "status", "createdAt");

ALTER TABLE "AgentWorkItem"
  ADD CONSTRAINT "AgentWorkItem_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ApprovalRequest"
  ADD CONSTRAINT "ApprovalRequest_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InputCollectionSession"
  ADD CONSTRAINT "InputCollectionSession_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountProofSnapshot"
  ADD CONSTRAINT "AccountProofSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversationProofSnapshot"
  ADD CONSTRAINT "ConversationProofSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
