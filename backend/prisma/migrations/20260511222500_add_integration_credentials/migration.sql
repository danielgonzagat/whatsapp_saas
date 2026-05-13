-- CreateTable
CREATE TABLE "RAC_IntegrationCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'google',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "loginCustomerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RAC_IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAC_IntegrationCredential_workspaceId_key" ON "RAC_IntegrationCredential" ("workspaceId");

-- CreateIndex
CREATE INDEX "RAC_IntegrationCredential_workspaceId_platform_idx" ON "RAC_IntegrationCredential" ("workspaceId", "platform");

-- AddForeignKey
ALTER TABLE "RAC_IntegrationCredential" ADD CONSTRAINT "RAC_IntegrationCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "RAC_Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
