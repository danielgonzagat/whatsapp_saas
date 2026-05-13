-- CreateTable
CREATE TABLE "RAC_ContactIdentityLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "linkedContactId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "matchReason" TEXT,
    "merged" BOOLEAN NOT NULL DEFAULT false,
    "mergedAt" TIMESTAMP(3),
    "mergedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_ContactIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAC_ContactIdentityLink_workspaceId_contactId_linkedContactId_key"
ON "RAC_ContactIdentityLink"("workspaceId", "contactId", "linkedContactId");

-- CreateIndex
CREATE INDEX "RAC_ContactIdentityLink_workspaceId_contactId_idx"
ON "RAC_ContactIdentityLink"("workspaceId", "contactId");

-- CreateIndex
CREATE INDEX "RAC_ContactIdentityLink_workspaceId_linkedContactId_idx"
ON "RAC_ContactIdentityLink"("workspaceId", "linkedContactId");

-- AddForeignKey
ALTER TABLE "RAC_ContactIdentityLink"
ADD CONSTRAINT "RAC_ContactIdentityLink_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "RAC_ContactIdentityLink"
ADD CONSTRAINT "RAC_ContactIdentityLink_contactId_workspaceId_fkey"
FOREIGN KEY ("contactId", "workspaceId") REFERENCES "RAC_Contact"("id", "workspaceId") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "RAC_ContactIdentityLink"
ADD CONSTRAINT "RAC_ContactIdentityLink_linkedContactId_workspaceId_fkey"
FOREIGN KEY ("linkedContactId", "workspaceId") REFERENCES "RAC_Contact"("id", "workspaceId") ON DELETE CASCADE;
