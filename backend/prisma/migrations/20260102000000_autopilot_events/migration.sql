-- Autopilot events: dedicated tracking for actions/latência/status

CREATE TABLE "AutopilotEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "intent" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "messageSent" TEXT,
    "responseText" TEXT,
    "latencyMs" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutopilotEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AutopilotEvent"
  ADD CONSTRAINT "AutopilotEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutopilotEvent"
  ADD CONSTRAINT "AutopilotEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AutopilotEvent_workspaceId_createdAt_idx" ON "AutopilotEvent"("workspaceId", "createdAt");
CREATE INDEX "AutopilotEvent_workspaceId_status_idx" ON "AutopilotEvent"("workspaceId", "status");
CREATE INDEX "AutopilotEvent_workspaceId_intent_idx" ON "AutopilotEvent"("workspaceId", "intent");
CREATE INDEX "AutopilotEvent_workspaceId_action_idx" ON "AutopilotEvent"("workspaceId", "action");
