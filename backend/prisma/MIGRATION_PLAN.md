# Migration Baseline Unification Plan

## What happened

The repository had two competing baseline migrations:

| Directory | Status |
|---|---|
| `20251209150035_init_baseline` (v1) | Deleted — DDL ordering caused Codacy HIGH issues |
| `20260510_init_baseline_v2` (v2) | Renamed → `20251209150035_init_baseline` |

The v2 DDL was topologically sorted (Kahn's algorithm, levels 0-5) so every
FOREIGN KEY references a table that already exists at `CREATE TABLE` or
`ALTER TABLE` time. This eliminates 35-37 Codacy Semgrep `rac-table-access`
HIGH issues that were false positives caused by DDL ordering, not by actual
security problems.

The timestamp `20251209150035` was preserved so existing databases that already
ran the original v1 migration continue to match the internal `_prisma_migrations`
table.

## Production DBs that applied the ORIGINAL v1

If a production database already ran `20251209150035_init_baseline` (the
original v1 DDL), the tables are already in place. The v2 migration.sql is a
**cleaner reordering of the same DDL** — same tables, same columns, same
constraints, same indexes. No new ALTER statements need to run.

### Option A: Mark as already applied (recommended)

Prisma tracks which migrations ran via the `_prisma_migrations` table. Since
the v1 migration is already applied and v2 produces identical state, mark it
as already applied:

```bash
npx prisma migrate resolve --applied 20251209150035_init_baseline
```

This tells Prisma the unified baseline migration has already been applied
without executing any DDL.

### Option B: Let Prisma detect the drift

If you prefer to let Prisma handle it, you can run:

```bash
npx prisma migrate deploy
```

Prisma will see `20251209150035_init_baseline` in the migrations directory.
If the `_prisma_migrations` table already contains a row with that timestamp
(inserted by the original v1), Prisma will attempt to run it again. Since
all `CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE ... ADD CONSTRAINT` statements
use `IF NOT EXISTS`-safe patterns... however, this baseline does NOT use
`IF NOT EXISTS` for tables (Prisma doesn't generate that).

**Do NOT run `prisma migrate deploy` with this unified baseline on a DB that
has the original v1 applied** — use Option A instead.

### Option C: Manual `_prisma_migrations` update

If `prisma migrate resolve` is unavailable (older Prisma):

```sql
-- Verify the old entry exists
SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20251209150035_init_baseline';

-- If the old v1 entry exists with a different checksum, update it to match
-- the new unified migration.sql checksum:
UPDATE _prisma_migrations
SET checksum = 'REPLACE_WITH_NEW_CHECKSUM'
WHERE migration_name = '20251209150035_init_baseline';
```

Get the new checksum with:

```bash
sha256sum backend/prisma/migrations/20251209150035_init_baseline/migration.sql | cut -d' ' -f1
```

## New databases (greenfield)

New databases that run `prisma migrate deploy` for the first time will apply
the unified baseline directly. The topological ordering guarantees a clean
first-run with zero FK ordering issues.

## Verification

```bash
cd backend
npx prisma validate
npx prisma generate
npx prisma migrate status  # shows migration state vs _prisma_migrations
```

## Side effects

- The original v1 `down.sql` was removed (the v2 baseline never had one).
  Baseline migrations should not be reversible in production.
- The `migration_lock.toml` did not change — Prisma manages it internally.
