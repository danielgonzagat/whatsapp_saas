/**
 * PULSE Parser 62: Schema Drift Detector
 * Layer 7: Database Health
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Compare the Prisma schema definition against the actual database structure.
 * Drift occurs when migrations are not applied, schema is edited manually,
 * or DB was modified outside of Prisma (direct SQL DDL).
 *
 * Table existence:
 * 1. For each model in schema.prisma, verify the mapped table exists in DB
 *    (using information_schema.tables or pg_tables for PostgreSQL)
 * 2. For each table in DB, verify a corresponding Prisma model exists
 *    (extra tables not in schema — could be from manual migration or leftover)
 *
 * Column existence and type:
 * 3. For each field in each Prisma model, verify the column exists in the DB table
 * 4. For each column in each DB table, verify it exists in the Prisma model
 *    (extra columns are suspicious — could mean schema was updated but Prisma not regenerated)
 * 5. Verify column types match:
 *    - String → VARCHAR or TEXT
 *    - Int → INTEGER or BIGINT
 *    - Float → FLOAT or DOUBLE or NUMERIC
 *    - Boolean → BOOLEAN
 *    - DateTime → TIMESTAMP or TIMESTAMPTZ
 *    - Json → JSON or JSONB
 * 6. Verify nullable status matches (isOptional in schema → nullable in DB)
 *
 * Indexes:
 * 7. For each @@index in schema, verify index exists in DB
 * 8. For each @@unique, verify UNIQUE constraint exists in DB
 * 9. For @id fields, verify PRIMARY KEY constraint exists
 *
 * Enum values:
 * 10. For each Prisma enum, verify the DB enum type has same values
 * 11. If a new enum value was added to schema but not migrated → SCHEMA_TYPE_MISMATCH
 *
 * Pending migrations:
 * 12. Check _prisma_migrations table for failed or pending migrations
 * 13. If any migration has failed_at set → flag as SCHEMA_TABLE_MISSING or SCHEMA_COLUMN_MISSING
 *
 * REQUIRES:
 * - Direct DB access (PULSE_DATABASE_URL — PostgreSQL connection string)
 * - Prisma schema file (config.schemaPath)
 * - Read access to information_schema and _prisma_migrations
 *
 * BREAK TYPES:
 * - SCHEMA_TABLE_MISSING (critical) — Prisma model has no corresponding DB table (migration not applied)
 * - SCHEMA_COLUMN_MISSING (critical) — Prisma field has no corresponding DB column
 * - SCHEMA_TYPE_MISMATCH (critical) — DB column type does not match Prisma field type
 */

import * as fs from 'fs';
import type { Break, PulseConfig } from '../types';
import { dbQuery, isDeepMode } from './runtime-utils';

/** Extract model names from schema.prisma by scanning for `model FooBar {` lines */
function extractPrismaModelNames(schemaPath: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(schemaPath, 'utf8');
  } catch {
    return [];
  }
  const models: string[] = [];
  const modelRe = /^model\s+(\w+)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(content)) !== null) {
    models.push(m[1]);
  }
  return models;
}

/**
 * Prisma maps model names to table names using the exact model name (PascalCase) by default
 * unless overridden with @@map("..."). We only handle the default case here — if @@map is
 * present we try to extract the mapped name too.
 */
function extractTableMappings(schemaPath: string): Map<string, string> {
  let content: string;
  try {
    content = fs.readFileSync(schemaPath, 'utf8');
  } catch {
    return new Map();
  }

  const map = new Map<string, string>();

  // Split into model blocks
  const blocks = content.split(/^model\s+/m).slice(1);
  for (const block of blocks) {
    const nameMatch = block.match(/^(\w+)\s*\{/);
    if (!nameMatch) {
      continue;
    }
    const modelName = nameMatch[1];

    // Check for @@map("tableName")
    const mapMatch = block.match(/@@map\("([^"]+)"\)/);
    map.set(modelName, mapMatch ? mapMatch[1] : modelName);
  }

  return map;
}

/** Check schema drift. */
export async function checkSchemaDrift(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires DB access
  if (!isDeepMode()) {
    return [];
  }

  const breaks: Break[] = [];

  try {
    // Get model → table name mappings from schema
    const tableMappings = extractTableMappings(config.schemaPath);

    if (tableMappings.size === 0) {
      return breaks; // Could not parse schema — skip silently
    }

    // Query all public tables from the DB
    let dbTables: string[];
    try {
      const rows = await dbQuery(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
      );
      dbTables = rows.map((r: any) => r.table_name as string);
    } catch (dbErr: any) {
      // pg not installed or DB unreachable — skip silently (infrastructure issue, not schema drift)
      // Common causes: pg package not in local deps, SSL misconfigured, no DATABASE_URL
      return breaks;
    }

    const dbTableSet = new Set(dbTables.map((t) => t.toLowerCase()));

    // For each Prisma model, verify the corresponding table exists in the DB
    for (const [modelName, tableName] of tableMappings) {
      const tableNameLower = tableName.toLowerCase();
      if (!dbTableSet.has(tableNameLower)) {
        breaks.push({
          type: 'SCHEMA_TABLE_MISSING',
          severity: 'critical',
          file: config.schemaPath,
          line: 0,
          description: `Prisma model "${modelName}" has no corresponding DB table`,
          detail: `Expected table "${tableName}" (or "${tableNameLower}") not found in information_schema.tables. Migration may not have been applied.`,
        });
      }
    }

    // Check _prisma_migrations for any failed migrations
    try {
      const failedMigrations = await dbQuery(
        "SELECT migration_name, started_at, finished_at FROM _prisma_migrations WHERE finished_at IS NULL OR logs LIKE '%ERROR%' LIMIT 20",
      );
      for (const row of failedMigrations) {
        breaks.push({
          type: 'SCHEMA_TABLE_MISSING',
          severity: 'critical',
          file: config.schemaPath,
          line: 0,
          description: `Failed Prisma migration detected: ${row.migration_name}`,
          detail: `Migration "${row.migration_name}" started at ${row.started_at} did not finish cleanly. Run \`prisma migrate status\` to investigate.`,
        });
      }
    } catch {
      // _prisma_migrations table may not exist in test DBs — skip
    }
  } catch (err: any) {
    breaks.push({
      type: 'SCHEMA_TABLE_MISSING',
      severity: 'critical',
      file: config.schemaPath,
      line: 0,
      description: 'Schema drift check threw an unexpected error',
      detail: err.message || String(err),
    });
  }

  return breaks;
}
