CREATE TYPE "AutonomyMode" AS ENUM (
  'OFF',
  'LIVE',
  'BACKLOG',
  'FULL',
  'HUMAN_ONLY',
  'SUSPENDED'
);

CREATE TABLE "AutonomyRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "mode" "AutonomyMode" NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "meta" JSONB,

  CONSTRAINT "AutonomyRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutonomyExecution" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT,
  "conversationId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "response" JSONB,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutonomyExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutonomyExecution_workspaceId_idempotencyKey_key"
  ON "AutonomyExecution"("workspaceId", "idempotencyKey");

CREATE INDEX "AutonomyRun_workspaceId_startedAt_idx"
  ON "AutonomyRun"("workspaceId", "startedAt");

CREATE INDEX "AutonomyRun_workspaceId_status_idx"
  ON "AutonomyRun"("workspaceId", "status");

CREATE INDEX "AutonomyExecution_workspaceId_contactId_createdAt_idx"
  ON "AutonomyExecution"("workspaceId", "contactId", "createdAt");

CREATE INDEX "AutonomyExecution_workspaceId_conversationId_createdAt_idx"
  ON "AutonomyExecution"("workspaceId", "conversationId", "createdAt");

ALTER TABLE "AutonomyRun"
  ADD CONSTRAINT "AutonomyRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutonomyExecution"
  ADD CONSTRAINT "AutonomyExecution_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
