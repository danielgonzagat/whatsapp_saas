ALTER TABLE "admin_chat_sessions"
  ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT '__admin__',
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "admin_chat_sessions_workspace_id_deleted_at_idx"
  ON "admin_chat_sessions"("workspace_id", "deleted_at");
