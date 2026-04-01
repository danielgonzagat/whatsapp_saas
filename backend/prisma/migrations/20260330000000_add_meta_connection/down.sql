-- Rollback: 20260330000000_add_meta_connection
-- Reverses: CreateTable MetaConnection + unique index + foreign key

ALTER TABLE "MetaConnection" DROP CONSTRAINT IF EXISTS "MetaConnection_workspaceId_fkey";
DROP INDEX IF EXISTS "MetaConnection_workspaceId_key";
DROP TABLE IF EXISTS "MetaConnection";
