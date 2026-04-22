CREATE TABLE "MetaLeadCapture" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'facebook_leadgen',
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT,
    "pageName" TEXT,
    "formId" TEXT,
    "adId" TEXT,
    "campaignId" TEXT,
    "createdTime" TIMESTAMP(3),
    "eventTime" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fullName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "fieldData" JSONB,
    "rawPayload" JSONB,
    "syncStatus" TEXT NOT NULL DEFAULT 'captured',
    "syncNotes" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaLeadCapture_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaLeadCapture_workspaceId_leadgenId_key"
ON "MetaLeadCapture"("workspaceId", "leadgenId");

CREATE INDEX "MetaLeadCapture_workspaceId_capturedAt_idx"
ON "MetaLeadCapture"("workspaceId", "capturedAt");

CREATE INDEX "MetaLeadCapture_workspaceId_formId_idx"
ON "MetaLeadCapture"("workspaceId", "formId");

CREATE INDEX "MetaLeadCapture_workspaceId_syncStatus_idx"
ON "MetaLeadCapture"("workspaceId", "syncStatus");

ALTER TABLE "MetaLeadCapture"
ADD CONSTRAINT "MetaLeadCapture_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MetaLeadCapture"
ADD CONSTRAINT "MetaLeadCapture_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
