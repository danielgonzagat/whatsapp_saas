-- Rollback: 20260328020000_add_bank_accounts_anticipations
-- Reverses: CreateTable BankAccount + WalletAnticipation

ALTER TABLE "WalletAnticipation" DROP CONSTRAINT IF EXISTS "WalletAnticipation_workspaceId_fkey";
ALTER TABLE "BankAccount" DROP CONSTRAINT IF EXISTS "BankAccount_workspaceId_fkey";

DROP INDEX IF EXISTS "WalletAnticipation_workspaceId_createdAt_idx";
DROP INDEX IF EXISTS "BankAccount_workspaceId_idx";

DROP TABLE IF EXISTS "WalletAnticipation";
DROP TABLE IF EXISTS "BankAccount";
