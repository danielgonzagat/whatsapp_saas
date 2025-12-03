# Prisma Alignment Plan

This codebase has drift between `prisma/schema.prisma` and the generated migrations in `prisma/migrations`. Before deploying, reconcile the schema with a clean migration set. Recommended steps:

1. **PgVector alignment**
   - Ensure `datasource` enables `pgvector` extension and that `Vector.embedding` uses `vector(1536)` instead of `JSONB`.
   - Add a migration that runs `CREATE EXTENSION IF NOT EXISTS vector;` and alters the `Vector.embedding` column to `vector(1536)`.

2. **FlowExecution model**
   - Target shape: `id`, `status`, `flowId`, `workspaceId`, `contactId?`, `conversationId?`, `currentNodeId?`, `state Json?`, `logs Json?`, timestamps.
   - Update migrations so FlowExecution matches the current `schema.prisma` (with workspace scoping and currentNodeId); remove legacy drops from older migrations.

3. **Tags and contact tags**
   - Current schema expects `Tag` table with `workspaceId_name` unique and many-to-many via Prisma relations.
   - If any migration dropped `Tag` or `_ContactToTag`, recreate them to match the schema; ensure contacts still have tags relation.

4. **Workspace settings**
   - Keep `jitterMin`, `jitterMax`, and `providerSettings Json` on `Workspace` (they were dropped in an older migration). Verify the active migration set preserves these fields.

5. **Launch/Group models**
   - Ensure `GroupLauncher` and `LaunchGroup` match schema (capacity/current/isActive, launcherId, updatedAt).

6. **Vector search tables**
   - `KnowledgeBase`, `KnowledgeSource`, `Vector` should be consistent with schema; avoid storing embeddings as JSONB.

7. **Rebuild migration history**
   - Option A: reset migrations (if data can be dropped), regenerate from schema, and apply fresh to all environments.
   - Option B: write a corrective migration that:
     - Adds back dropped columns/tables (Workspace settings, Tag, FlowExecution cols).
     - Alters `Vector.embedding` to pgvector.
     - Recreates required indexes/uniques (e.g., `flowExecution (workspaceId, createdAt)`, `flowId, createdAt`).

8. **Data backfill/validation**
   - For existing data, backfill `workspaceId` where missing, and ensure FlowExecution rows have valid `flowId` and `workspaceId`.
   - Recreate tags associations if they were dropped.

9. **Smoke test after migration**
   - Run `npm test` (backend) and a basic flow execution end-to-end.
   - Verify embeddings insertion works (RAG).

Track this plan in version control and execute before the next production deploy.***
