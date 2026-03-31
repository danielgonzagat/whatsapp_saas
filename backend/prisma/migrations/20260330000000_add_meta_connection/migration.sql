-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "pageId" TEXT,
    "pageName" TEXT,
    "pageAccessToken" TEXT,
    "instagramAccountId" TEXT,
    "instagramUsername" TEXT,
    "whatsappPhoneNumberId" TEXT,
    "whatsappBusinessId" TEXT,
    "adAccountId" TEXT,
    "pixelId" TEXT,
    "catalogId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_workspaceId_key" ON "MetaConnection"("workspaceId");

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
