-- SP-14 — Admin AI Chat v0
-- AdminChatSession + AdminChatMessage. Messages are append-only by
-- convention (no update/delete exposed in the service). Sessions
-- expire after 24h; a background sweeper in a follow-up PR will
-- cascade-delete expired sessions (and their messages).

-- CreateEnum
CREATE TYPE "AdminChatRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');

-- CreateTable
CREATE TABLE "admin_chat_sessions" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_chat_sessions_admin_user_id_last_used_at_idx"
  ON "admin_chat_sessions"("admin_user_id", "last_used_at");

-- CreateTable
CREATE TABLE "admin_chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "AdminChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_name" TEXT,
    "tool_args" JSONB,
    "tool_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_chat_messages_session_id_created_at_idx"
  ON "admin_chat_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "admin_chat_messages"
  ADD CONSTRAINT "admin_chat_messages_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "admin_chat_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
