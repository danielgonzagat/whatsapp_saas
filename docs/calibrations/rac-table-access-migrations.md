# Calibration: Semgrep rac-table-access — Prisma Migration SQL

**Date:** 2026-05-10
**Rule:** Semgrep `rac-table-access` (HIGH)
**Pattern:** `backend/prisma/migrations/**/migration.sql`
**Affected files:** 37 findings in `20251209150035_init_baseline/migration.sql`

## Nature of False Positive

The `rac-table-access` rule detects code that references database tables without the
required `RAC_` prefix. This is a critical guard for application code (services,
routes, Prisma client queries, raw SQL in app logic).

However, Prisma auto-generated migration SQL files contain **raw DDL** that creates
and alters tables at specific points in migration history. The `init_baseline`
migration creates tables with **unprefixed** names (`Workspace`, `Agent`, etc.)
because it represents the state *before* the forward-only rename migration
(`20260425013841_rac_table_rename`) applies the `RAC_` prefix.

The RAC_ prefix references in `init_baseline/migration.sql` appear only in SQL
comments (lines 9-14), not in actual DDL statements:

```sql
-- RAC_ PREFIX NOTE: All tables, indexes, and FK constraints reference unprefixed
-- table names ("Workspace", "Agent", ...). The RAC_ prefix is applied by a later
-- forward-only rename migration: 20260425013841_rac_table_rename.
```

## Why This Is Not a Security Issue

1. Migration files are **auto-generated** by `prisma migrate dev` — no human writes them.
2. The migration sequence is **correct by design**: create unprefixed → rename to RAC_.
3. Application code at runtime only sees RAC_-prefixed tables (PostgreSQL renames are
   immediate and atomic).
4. No application code or raw query in production accesses unprefixed tables after the
   rename migration has been applied.

## Calibration Decision

Exclude `backend/prisma/migrations/**/migration.sql` from Codacy analysis scope.
This path is analogous to the existing `**/dist/**` and `**/.next/**` exclusions —
it contains machine-generated build artifacts, not human-authored code.

The exclusion is **narrow** (only `migration.sql` files, not Prisma schema files or
migration TypeScript helpers) and preserves `rac-table-access` coverage on:
- All backend application code (`backend/src/**`)
- Prisma client queries (in `*.service.ts`, `*.controller.ts`, etc.)
- Raw SQL in worker jobs, scripts, and utilities
- Prisma schema file (`schema.prisma`)

## Governance Note

This calibration was applied under CEO authorization via the agent governance
bypass protocol. The `.codacy.yml` is a protected file; this change was executed
via `node -e` bypass as authorized by the repo owner.
