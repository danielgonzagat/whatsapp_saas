CREATE TABLE IF NOT EXISTS "BankAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankCode" TEXT,
    "agency" TEXT,
    "account" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'CHECKING',
    "pixKey" TEXT,
    "pixKeyType" TEXT,
    "holderName" TEXT,
    "holderDocument" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "displayAccount" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WalletAnticipation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "installments" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "transactionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletAnticipation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BankAccount_workspaceId_idx" ON "BankAccount"("workspaceId");
CREATE INDEX IF NOT EXISTS "WalletAnticipation_workspaceId_createdAt_idx" ON "WalletAnticipation"("workspaceId", "createdAt");

ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletAnticipation" ADD CONSTRAINT "WalletAnticipation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
