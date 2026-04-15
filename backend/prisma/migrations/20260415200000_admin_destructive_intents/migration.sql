-- SP-8 — Destructive Operations Safety Layer
-- Creates DestructiveIntent model + enforces I-ADMIN-D1 (append-ish)
-- at the database level. DELETE is always blocked. UPDATE is blocked
-- unless ONLY the allowlisted columns change (status, confirmed_at,
-- executed_at, executed_by_admin_user_id, failure_message,
-- result_snapshot, undo_token_hash, undo_expires_at, undo_at).

-- CreateEnum
CREATE TYPE "DestructiveIntentKind" AS ENUM (
  'ACCOUNT_SUSPEND',
  'ACCOUNT_DEACTIVATE',
  'ACCOUNT_HARD_DELETE',
  'PRODUCT_ARCHIVE',
  'PRODUCT_DELETE',
  'REFUND_MANUAL',
  'PAYOUT_CANCEL',
  'MFA_RESET',
  'FORCE_LOGOUT_GLOBAL',
  'CACHE_PURGE'
);

-- CreateEnum
CREATE TYPE "DestructiveIntentStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
  'EXPIRED',
  'UNDONE'
);

-- CreateTable
CREATE TABLE "destructive_intents" (
    "id" TEXT NOT NULL,
    "created_by_admin_user_id" TEXT NOT NULL,
    "kind" "DestructiveIntentKind" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "requires_otp" BOOLEAN NOT NULL DEFAULT false,
    "reversible" BOOLEAN NOT NULL DEFAULT false,
    "status" "DestructiveIntentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "executed_by_admin_user_id" TEXT,
    "failure_message" TEXT,
    "result_snapshot" JSONB,
    "undo_token_hash" TEXT,
    "undo_expires_at" TIMESTAMP(3),
    "undo_at" TIMESTAMP(3),
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,

    CONSTRAINT "destructive_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "destructive_intents_kind_status_created_at_idx" ON "destructive_intents"("kind", "status", "created_at");
CREATE INDEX "destructive_intents_created_by_admin_user_id_created_at_idx" ON "destructive_intents"("created_by_admin_user_id", "created_at");
CREATE INDEX "destructive_intents_target_type_target_id_idx" ON "destructive_intents"("target_type", "target_id");

-- ============================================================================
-- Invariant I-ADMIN-D1 — destructive_intents is near-append-only.
-- DELETE is always blocked. UPDATE is blocked unless ONLY the
-- allowlisted columns changed. All the create-time columns (kind,
-- target_type, target_id, reason, challenge, created_by, ip, user_agent,
-- expires_at) are immutable after insert.
-- ============================================================================
CREATE OR REPLACE FUNCTION destructive_intents_block_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'destructive_intents rows cannot be deleted (invariant I-ADMIN-D1)';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'destructive_intents.id is immutable';
    END IF;
    IF NEW.created_by_admin_user_id <> OLD.created_by_admin_user_id THEN
      RAISE EXCEPTION 'destructive_intents.created_by_admin_user_id is immutable';
    END IF;
    IF NEW.kind <> OLD.kind THEN
      RAISE EXCEPTION 'destructive_intents.kind is immutable';
    END IF;
    IF NEW.target_type <> OLD.target_type OR NEW.target_id <> OLD.target_id THEN
      RAISE EXCEPTION 'destructive_intents.target_(type|id) is immutable';
    END IF;
    IF NEW.reason <> OLD.reason THEN
      RAISE EXCEPTION 'destructive_intents.reason is immutable';
    END IF;
    IF NEW.challenge <> OLD.challenge THEN
      RAISE EXCEPTION 'destructive_intents.challenge is immutable';
    END IF;
    IF NEW.requires_otp <> OLD.requires_otp THEN
      RAISE EXCEPTION 'destructive_intents.requires_otp is immutable';
    END IF;
    IF NEW.reversible <> OLD.reversible THEN
      RAISE EXCEPTION 'destructive_intents.reversible is immutable';
    END IF;
    IF NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'destructive_intents.created_at is immutable';
    END IF;
    IF NEW.expires_at <> OLD.expires_at THEN
      RAISE EXCEPTION 'destructive_intents.expires_at is immutable';
    END IF;
    IF NEW.ip <> OLD.ip THEN
      RAISE EXCEPTION 'destructive_intents.ip is immutable';
    END IF;
    IF NEW.user_agent <> OLD.user_agent THEN
      RAISE EXCEPTION 'destructive_intents.user_agent is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER destructive_intents_no_delete
BEFORE DELETE ON destructive_intents
FOR EACH ROW EXECUTE FUNCTION destructive_intents_block_mutation();

CREATE TRIGGER destructive_intents_restrict_update
BEFORE UPDATE ON destructive_intents
FOR EACH ROW EXECUTE FUNCTION destructive_intents_block_mutation();
