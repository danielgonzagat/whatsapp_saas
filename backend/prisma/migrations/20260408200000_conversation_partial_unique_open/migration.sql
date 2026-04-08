-- Wave 2 P6-6 / Invariant I14 — Conversation Singleton-Open
--
-- At any point in time there must be at most one Conversation with
-- status != 'CLOSED' for a given (workspaceId, contactId, channel).
--
-- Prisma's `@@unique` does not support partial (filtered) unique indexes,
-- so this is defined as a raw SQL migration. The schema.prisma file still
-- declares the non-unique (workspaceId, status) and (workspaceId,
-- lastMessageAt) indexes for query performance.
--
-- Before this index existed, getOrCreateConversation() in
-- backend/src/inbox/inbox.service.ts used findFirst + create, which is
-- a classic check-then-insert race: two concurrent inbound messages for
-- the same (workspaceId, contactId) both saw no existing OPEN conversation
-- and both called create(), ending up with two distinct OPEN conversations
-- pointing at the same contact. Subsequent messages routed to whichever
-- conversation the next read picked, fragmenting the inbox.
--
-- With this index in place, the second create() fails with Postgres error
-- 23505 (unique_violation), which Prisma surfaces as error code 'P2002'.
-- The caller catches that, re-reads the now-existing conversation, and
-- returns it. See the retry loop in getOrCreateConversation.
--
-- Index name: conversation_one_open_per_workspace_contact_channel
-- Columns:    ("workspaceId", "contactId", "channel")
-- Predicate:  WHERE "status" != 'CLOSED'
--
-- Backfill: before enforcing uniqueness, close duplicate open conversations
-- so the CREATE INDEX does not fail on existing rows. The rule is "keep
-- the most recently active (lastMessageAt desc, then createdAt desc), CLOSE
-- all others". A manual review may reconcile messages afterward — but the
-- urgent job is to make the constraint enforceable.

BEGIN;

-- Step 1 — deduplicate existing data.
-- For each (workspaceId, contactId, channel) group that has more than one
-- non-closed conversation, keep the most recent and mark the rest CLOSED.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "contactId", "channel"
      ORDER BY "lastMessageAt" DESC NULLS LAST, "createdAt" DESC
    ) AS rank
  FROM "Conversation"
  WHERE "status" != 'CLOSED'
)
UPDATE "Conversation"
SET "status" = 'CLOSED',
    "updatedAt" = NOW()
WHERE "id" IN (SELECT "id" FROM ranked WHERE rank > 1);

-- Step 2 — create the partial unique index.
-- CONCURRENTLY cannot be used inside a transaction and the dedup above
-- requires the same transaction, so we use the blocking form. The index
-- is small relative to the table; creation takes milliseconds on typical
-- workloads. Run during a maintenance window if the Conversation table
-- is especially large.
CREATE UNIQUE INDEX "conversation_one_open_per_workspace_contact_channel"
  ON "Conversation" ("workspaceId", "contactId", "channel")
  WHERE "status" != 'CLOSED';

COMMIT;
