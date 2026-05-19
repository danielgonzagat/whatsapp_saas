-- UTP-LINEAGE-007 — Lineage Ledger persistence (additive).
-- Implements PCI.3 §5 (docs/contracts/pci/03-genesis-lineage.md).
-- Append-only: no updated_at column by design. Application layer enforces
-- absence of UPDATE/DELETE on this table; consider DB triggers as a future
-- defence in depth (out of scope for this UTP).

CREATE TABLE "RAC_LineageEntry" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "ledgerEntryId"   TEXT         NOT NULL,
    "sequenceNumber"  INTEGER      NOT NULL,
    "prevEntryHash"   TEXT         NOT NULL,
    "eventId"         TEXT         NOT NULL,
    "eventName"       TEXT         NOT NULL,
    "timestampUtc"    TIMESTAMP(3) NOT NULL,
    "payloadJson"     JSONB        NOT NULL,
    "hash"            TEXT         NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAC_LineageEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RAC_LineageEntry_ledgerEntryId_key" ON "RAC_LineageEntry"("ledgerEntryId");
CREATE UNIQUE INDEX "RAC_LineageEntry_sequenceNumber_key" ON "RAC_LineageEntry"("sequenceNumber");
CREATE UNIQUE INDEX "RAC_LineageEntry_hash_key" ON "RAC_LineageEntry"("hash");
CREATE INDEX "RAC_LineageEntry_sequenceNumber_idx" ON "RAC_LineageEntry"("sequenceNumber");
CREATE INDEX "RAC_LineageEntry_eventName_idx" ON "RAC_LineageEntry"("eventName");
