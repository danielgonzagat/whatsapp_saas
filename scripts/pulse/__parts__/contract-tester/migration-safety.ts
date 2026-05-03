import type { Dirent } from 'fs';

import type { MigrationSafetyCheck, SchemaDiffSeverity } from '../../types.contract-tester';
import { readTextFile, readDir, pathExists } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import {
  DROP_TABLE_RE,
  DROP_COLUMN_RE,
  ALTER_COLUMN_TYPE_RE,
  IGNORE_DIRS,
  MIGRATIONS_DIRS,
} from './constants';

// ---------------------------------------------------------------------------
// Migration safety checking
// ---------------------------------------------------------------------------

export function checkMigrationSafety(rootDir: string): MigrationSafetyCheck[] {
  const results: MigrationSafetyCheck[] = [];
  const migrationsDir = findMigrationsDir(rootDir);

  if (!migrationsDir) return results;

  let entries: (string | Dirent)[];
  try {
    entries = readDir(migrationsDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (typeof entry === 'string') continue;
    if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name)) continue;

    const sqlPath = safeJoin(migrationsDir, entry.name, 'migration.sql');
    if (!pathExists(sqlPath)) continue;

    let sqlContent: string;
    try {
      sqlContent = readTextFile(sqlPath, 'utf-8');
    } catch {
      continue;
    }

    const check = parseMigrationSql(entry.name, sqlContent);
    results.push(check);
  }

  return results;
}

function findMigrationsDir(rootDir: string): string | null {
  for (const candidate of MIGRATIONS_DIRS) {
    const full = safeJoin(rootDir, candidate);
    if (pathExists(full)) return full;
  }
  return null;
}

function parseMigrationSql(migrationName: string, sql: string): MigrationSafetyCheck {
  const operations: Array<{ type: string; table: string; column?: string }> = [];
  const warnings: string[] = [];
  let destructive = false;

  for (const match of sql.matchAll(DROP_TABLE_RE)) {
    const table = match[1];
    operations.push({ type: 'DROP TABLE', table });
    warnings.push(`DROP TABLE "${table}" detected — this is destructive and will cause data loss`);
    destructive = true;
  }

  for (const match of sql.matchAll(DROP_COLUMN_RE)) {
    const column = match[1];
    operations.push({ type: 'DROP COLUMN', table: 'unknown', column });
    warnings.push(`DROP COLUMN "${column}" detected — this is destructive and may cause data loss`);
    destructive = true;
  }

  for (const match of sql.matchAll(ALTER_COLUMN_TYPE_RE)) {
    const column = match[1];
    const newType = match[2]?.trim();
    operations.push({ type: 'ALTER COLUMN TYPE', table: 'unknown', column });
    warnings.push(
      `ALTER COLUMN "${column}" TYPE ${newType ?? ''} detected — type changes can be destructive and may cause data corruption`,
    );
    destructive = true;
  }

  const setNotNullRe =
    /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?[\s\S]*?ALTER\s+COLUMN\s+[`"]?(\w+)[`"]?\s+SET\s+NOT\s+NULL/gi;
  for (const match of sql.matchAll(setNotNullRe)) {
    const table = match[1];
    const column = match[2];
    operations.push({ type: 'SET NOT NULL', table, column });
    warnings.push(
      `ALTER COLUMN "${column}" SET NOT NULL on table "${table}" — will fail when rows contain null values`,
    );
    destructive = true;
  }

  const alterTableAddColRe =
    /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s*\n?\s*(ADD\s+COLUMN\s+[\s\S]*?)(?=\s*ALTER\s+TABLE\s|\s*CREATE\s+(?:TABLE|INDEX)|$)/gi;
  for (const match of sql.matchAll(alterTableAddColRe)) {
    const table = match[1];
    const addColSplitRe =
      /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s+(\w[\s\S]*?)(?=\s*(?:ALTER\s+TABLE|ADD\s+COLUMN|CREATE\s+(?:TABLE|INDEX)|$))/gi;
    const addColMatches = match[2]?.matchAll(addColSplitRe) ?? [];

    for (const colMatch of Array.from(addColMatches)) {
      const column = colMatch[1];
      const rest = colMatch[2] ?? '';
      const hasNotNull = /\bNOT\s+NULL\b/i.test(rest);
      const hasDefault = /\bDEFAULT\b/i.test(rest);
      if (hasNotNull && !hasDefault) {
        operations.push({
          type: 'ADD NOT NULL COLUMN (NO DEFAULT)',
          table,
          column,
        });
        warnings.push(
          `ADD COLUMN "${column}" NOT NULL WITHOUT DEFAULT on table "${table}" — will fail on existing rows. Add a DEFAULT value or make the column nullable.`,
        );
        destructive = true;
      }
    }
  }

  return {
    migrationName,
    destructive,
    operations,
    warnings,
    safe: !destructive,
  };
}

// ---------------------------------------------------------------------------
// Breaking change classification
// ---------------------------------------------------------------------------

export function classifyBreakingChange(change: {
  type: string;
  before?: unknown;
  after?: unknown;
}): SchemaDiffSeverity {
  const type = change.type.toLowerCase();

  if (type === 'endpoint_removed' || type === 'removed') {
    return 'breaking';
  }

  if (type === 'type_change' || type === 'type_changed') {
    return 'breaking';
  }

  if (type === 'field_removed') {
    return 'breaking';
  }

  if (type === 'field_required_added' || type === 'required_added') {
    return 'breaking';
  }

  if (type === 'endpoint_added' || type === 'added' || type === 'field_added') {
    if (change.after !== undefined && change.before === null) {
      return 'addition';
    }
  }

  if (type === 'field_optional_added' || type === 'optional_added') {
    return 'non_breaking';
  }

  if (
    type === 'deprecated' ||
    type === 'deprecation' ||
    type === 'marked_deprecated' ||
    (change.before !== undefined && change.after === null)
  ) {
    return 'deprecation';
  }

  return 'non_breaking';
}
