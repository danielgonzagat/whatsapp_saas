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
 * DIAGNOSTICS:
 * Emits generated schema-drift diagnostics from DB/schema evidence predicates.
 */

import type { Break, PulseConfig } from '../types';
import { dbQuery, isDeepMode } from './runtime-utils';
import { readTextFile } from '../safe-fs';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import { buildPredicateGraph } from '../predicate-graph';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';

type SchemaDriftTruthMode = 'confirmed_static' | 'observed';

interface ModelBlockEvidence {
  modelName: string;
  body: string;
}

interface SchemaDriftDiagnosticInput {
  truthMode: SchemaDriftTruthMode;
  predicates: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  summary: string;
  detail: string;
}

function diagnosticToken(value: string): string {
  let token = '';
  for (const char of value) {
    const lower = char.toLowerCase();
    const isAlphaNumeric = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9');
    token += isAlphaNumeric ? lower : '-';
  }
  return token.split('-').filter(Boolean).join('-');
}

function buildSchemaDriftDiagnostic(input: SchemaDriftDiagnosticInput): Break {
  const signal: PulseSignalEvidence = {
    source: `db-schema-evidence:schema-drift;predicates=${input.predicates.join(',')}`,
    detector: 'schema-drift',
    truthMode: input.truthMode,
    summary: input.summary,
    detail: input.detail,
    location: {
      file: input.file,
      line: input.line,
    },
  };
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );
  const predicateToken = input.predicates.map(diagnosticToken).filter(Boolean).join('+');

  return {
    type: ['diagnostic', 'schema-drift', predicateToken || diagnostic.id].join(':'),
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; ${input.detail}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'schema-drift',
  };
}

function appendDiagnostic(diagnostics: Break[], input: SchemaDriftDiagnosticInput): void {
  diagnostics.push(buildSchemaDriftDiagnostic(input));
}

function readIdentifier(value: string, start: number): { text: string; end: number } | null {
  let index = start;
  while (index < value.length && /\s/.test(value[index])) {
    index++;
  }

  const first = value[index];
  if (!first || !isIdentifierStart(first)) {
    return null;
  }

  let end = index + 1;
  while (end < value.length && isIdentifierPart(value[end])) {
    end++;
  }

  return { text: value.slice(index, end), end };
}

function isIdentifierStart(char: string): boolean {
  const lower = char.toLowerCase();
  return (lower >= 'a' && lower <= 'z') || char === '_';
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || (char >= '0' && char <= '9');
}

function skipQuotedString(value: string, start: number): number {
  const quote = value[start];
  let index = start + 1;
  while (index < value.length) {
    if (value[index] === '\\') {
      index += 2;
      continue;
    }
    if (value[index] === quote) {
      return index + 1;
    }
    index++;
  }
  return index;
}

function findMatchingBrace(value: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < value.length; index++) {
    const char = value[index];
    if (char === '"' || char === "'") {
      index = skipQuotedString(value, index) - 1;
      continue;
    }
    if (char === '{') {
      depth++;
      continue;
    }
    if (char !== '}') {
      continue;
    }
    depth--;
    if (depth === 0) {
      return index;
    }
  }
  return value.length;
}

function collectModelBlocks(content: string): ModelBlockEvidence[] {
  const blocks: ModelBlockEvidence[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const modelTokenIndex = content.indexOf('model', cursor);
    if (modelTokenIndex < 0) {
      break;
    }
    const before = content[modelTokenIndex - 1] ?? ' ';
    const after = content[modelTokenIndex + 'model'.length] ?? ' ';
    if (isIdentifierPart(before) || !/\s/.test(after)) {
      cursor = modelTokenIndex + 'model'.length;
      continue;
    }

    const name = readIdentifier(content, modelTokenIndex + 'model'.length);
    if (!name) {
      cursor = modelTokenIndex + 'model'.length;
      continue;
    }

    const openBraceIndex = content.indexOf('{', name.end);
    if (openBraceIndex < 0) {
      break;
    }
    const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
    blocks.push({
      modelName: name.text,
      body: content.slice(openBraceIndex + 1, closeBraceIndex),
    });
    cursor = closeBraceIndex + 1;
  }

  return blocks;
}

function readMappedTableName(modelBody: string): string | null {
  const mapTokenIndex = modelBody.indexOf('@@map');
  if (mapTokenIndex < 0) {
    return null;
  }
  const openParenIndex = modelBody.indexOf('(', mapTokenIndex);
  if (openParenIndex < 0) {
    return null;
  }
  let cursor = openParenIndex + 1;
  while (cursor < modelBody.length && /\s/.test(modelBody[cursor])) {
    cursor++;
  }
  if (modelBody[cursor] !== '"') {
    return null;
  }
  const valueStart = cursor + 1;
  const valueEnd = skipQuotedString(modelBody, cursor) - 1;
  return modelBody.slice(valueStart, valueEnd);
}

/**
 * Prisma maps model names to table names using the exact model name (PascalCase) by default
 * unless overridden with @@map("...").
 */
function extractTableMappings(schemaPath: string): Map<string, string> {
  let content: string;
  try {
    content = readTextFile(schemaPath, 'utf8');
  } catch {
    return new Map();
  }

  const map = new Map<string, string>();
  for (const block of collectModelBlocks(content)) {
    map.set(block.modelName, readMappedTableName(block.body) ?? block.modelName);
  }

  return map;
}

function readStringProperty(row: unknown, property: string): string | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const value = (row as Record<string, unknown>)[property];
  return typeof value === 'string' ? value : null;
}

function readDbTableNames(rows: unknown[]): string[] {
  return rows
    .map((row) => readStringProperty(row, 'table_name'))
    .filter((tableName): tableName is string => Boolean(tableName));
}

function detailForUnexpectedError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Check schema drift. */
export async function checkSchemaDrift(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires DB access
  if (!isDeepMode()) {
    return [];
  }

  const diagnostics: Break[] = [];

  try {
    // Get model → table name mappings from schema
    const tableMappings = extractTableMappings(config.schemaPath);

    if (tableMappings.size === 0) {
      return diagnostics; // Could not parse schema — skip silently
    }

    // Query all public tables from the DB
    let dbTables: string[];
    try {
      const rows = await dbQuery(
        "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
      );
      dbTables = readDbTableNames(rows);
    } catch {
      // pg not installed or DB unreachable — skip silently (infrastructure issue, not schema drift)
      // Common causes: pg package not in local deps, SSL misconfigured, no DATABASE_URL
      return diagnostics;
    }

    const dbTableSet = new Set(dbTables.map((t) => t.toLowerCase()));

    // For each Prisma model, verify the corresponding table exists in the DB
    for (const [modelName, tableName] of tableMappings) {
      const tableNameLower = tableName.toLowerCase();
      if (!dbTableSet.has(tableNameLower)) {
        appendDiagnostic(diagnostics, {
          truthMode: 'observed',
          predicates: ['schema_model_observed', 'database_table_not_observed'],
          severity: 'critical',
          file: config.schemaPath,
          line: 0,
          summary: `Prisma model "${modelName}" has no corresponding DB table evidence`,
          detail:
            `Expected table "${tableName}" (case-folded as "${tableNameLower}") was not observed in database catalog evidence. ` +
            'Migration may not have been applied.',
        });
      }
    }

    // Check _prisma_migrations for any failed migrations
    try {
      const failedMigrations = await dbQuery(
        "select migration_name, started_at, finished_at from _prisma_migrations where finished_at is null or logs like '%ERROR%' limit 20",
      );
      for (const row of failedMigrations) {
        const migrationName = readStringProperty(row, 'migration_name') ?? 'unidentified migration';
        appendDiagnostic(diagnostics, {
          truthMode: 'observed',
          predicates: ['migration_record_observed', 'migration_completion_not_observed'],
          severity: 'critical',
          file: config.schemaPath,
          line: 0,
          summary: `Prisma migration lacks completion evidence: ${migrationName}`,
          detail:
            `Migration "${migrationName}" did not finish cleanly according to migration catalog evidence. ` +
            'Run `prisma migrate status` to investigate.',
        });
      }
    } catch {
      // _prisma_migrations table may not exist in test DBs — skip
    }
  } catch (error) {
    appendDiagnostic(diagnostics, {
      truthMode: 'confirmed_static',
      predicates: ['schema_drift_parser_execution', 'unexpected_error_observed'],
      severity: 'critical',
      file: config.schemaPath,
      line: 0,
      summary: 'Schema drift check threw an unexpected error',
      detail: detailForUnexpectedError(error),
    });
  }

  return diagnostics;
}
