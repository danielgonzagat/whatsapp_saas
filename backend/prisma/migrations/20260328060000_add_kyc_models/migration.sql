-- AlterTable: Add KYC columns to Agent
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "documentType" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "kycStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "kycSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "kycApprovedAt" TIMESTAMP(3);
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "kycRejectedReason" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "publicName" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "instagram" TEXT;

-- CreateTable: KycDocument
CREATE TABLE IF NOT EXISTS "KycDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectedReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FiscalData
CREATE TABLE IF NOT EXISTS "FiscalData" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cpf" TEXT,
    "fullName" TEXT,
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "responsavelCpf" TEXT,
    "responsavelNome" TEXT,
    "cep" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KycDocument_workspaceId_idx" ON "KycDocument"("workspaceId");
CREATE INDEX IF NOT EXISTS "KycDocument_agentId_idx" ON "KycDocument"("agentId");
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalData_workspaceId_key" ON "FiscalData"("workspaceId");
CREATE INDEX IF NOT EXISTS "FiscalData_workspaceId_idx" ON "FiscalData"("workspaceId");

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
