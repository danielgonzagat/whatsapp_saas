-- CreateTable
CREATE TABLE "RAC_FbMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mid" TEXT,
    "direction" TEXT NOT NULL,
    "text" TEXT,
    "senderPsid" TEXT,
    "recipientPsid" TEXT,
    "pageId" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'SENT',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_FbMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAC_FbMessage_workspaceId_mid_key" ON "RAC_FbMessage" ("workspaceId", "mid");

-- CreateIndex
CREATE INDEX "RAC_FbMessage_workspaceId_pageId_createdAt_idx" ON "RAC_FbMessage" ("workspaceId", "pageId", "createdAt");

-- CreateIndex
CREATE INDEX "RAC_FbMessage_workspaceId_senderPsid_idx" ON "RAC_FbMessage" ("workspaceId", "senderPsid");

-- AddForeignKey
ALTER TABLE "RAC_FbMessage" ADD CONSTRAINT "RAC_FbMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
