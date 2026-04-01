-- Rollback: 20260328030000_add_converted_status
-- Reverses: Adding 'CONVERTED' value to ConversationStatus enum
-- NOTE: PostgreSQL does not support removing enum values directly.
-- To fully reverse this, you would need to recreate the enum without CONVERTED
-- and update all columns using it. This is a no-op rollback since the extra
-- enum value is harmless.

-- If a full reversal is required, run:
-- 1. ALTER TABLE "Conversation" ALTER COLUMN "status" TYPE TEXT;
-- 2. DROP TYPE "ConversationStatus";
-- 3. CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'PENDING', 'SNOOZED');
-- 4. ALTER TABLE "Conversation" ALTER COLUMN "status" TYPE "ConversationStatus" USING "status"::"ConversationStatus";

SELECT 'NOTICE: Enum value CONVERTED left in ConversationStatus (removal requires table rewrite)' AS rollback_note;
