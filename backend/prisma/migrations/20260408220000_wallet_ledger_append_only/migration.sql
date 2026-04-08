-- Wave 2 P6-4 / Invariant I12 — KloelWalletLedger append-only
--
-- Creates the audit log table that backs the wallet ledger reconciliation.
-- Every wallet balance mutation must append a corresponding row inside the
-- same Prisma $transaction (enforced in application code via
-- WalletLedgerService.appendWithinTx — see backend/src/kloel/wallet-ledger.service.ts).
--
-- The table is intentionally narrow:
--
--   id              uuid PK
--   workspaceId     scope for tenant isolation + reconciliation queries
--   walletId        FK with ON DELETE CASCADE — entries die with their wallet
--   transactionId   nullable — adjustments may not tie to a KloelWalletTransaction
--   direction       'credit' | 'debit'
--   bucket          'available' | 'pending' | 'blocked'
--   amountInCents   BIGINT (always non-negative; sign is in `direction`)
--   reason          structured string identifying the originating operation
--   metadata        JSONB for human-readable audit context
--   createdAt       monotonic timestamp
--
-- Indexes:
--   (workspaceId, walletId, createdAt) — sums + history scans
--   (workspaceId, transactionId)       — find ledger entries for a tx
--
-- The model has no `updatedAt` and no UPDATE/DELETE statements anywhere
-- in the application code. Append-only is enforced by convention; an
-- audit grep + the property test (wallet ledger sum equals balance) is
-- the verification.

CREATE TABLE IF NOT EXISTS "KloelWalletLedger" (
  "id"            TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "walletId"      TEXT NOT NULL,
  "transactionId" TEXT,
  "direction"     TEXT NOT NULL,
  "bucket"        TEXT NOT NULL,
  "amountInCents" BIGINT NOT NULL,
  "reason"        TEXT NOT NULL,
  "metadata"      JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KloelWalletLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KloelWalletLedger_walletId_fkey"
    FOREIGN KEY ("walletId")
    REFERENCES "KloelWallet"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "KloelWalletLedger_workspaceId_walletId_createdAt_idx"
  ON "KloelWalletLedger" ("workspaceId", "walletId", "createdAt");

CREATE INDEX IF NOT EXISTS "KloelWalletLedger_workspaceId_transactionId_idx"
  ON "KloelWalletLedger" ("workspaceId", "transactionId");
