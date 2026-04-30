/**
 * PULSE Parser 61: Data Integrity
 * Layer 7: Database Health
 * Mode: DEEP (requires running infrastructure)
 *
 * The authoritative checks are generated from Prisma schema relations. Legacy
 * table-specific SQL is not allowed to become universal machine truth here.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { Break, PulseConfig } from '../types';
import { dbQuery } from './runtime-utils';

interface PrismaField {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  columnName: string;
  attributes: string;
}

interface PrismaModel {
  name: string;
  tableName: string;
  fields: PrismaField[];
}

interface RelationInvariant {
  childModel: PrismaModel;
  parentModel: PrismaModel;
  relationField: PrismaField;
  localFields: PrismaField[];
  referencedFields: PrismaField[];
}

interface WeakNumericInvariant {
  model: PrismaModel;
  field: PrismaField;
}

function stripLineComment(line: string): string {
  const marker = line.indexOf('//');
  return marker === -1 ? line : line.slice(0, marker);
}

function extractAttributeValue(attributes: string, attributeName: string): string | null {
  const pattern = new RegExp(`@${attributeName}\\("([^"]+)"\\)`);
  return pattern.exec(attributes)?.[1] ?? null;
}

function extractBracketList(attributes: string, key: string): string[] {
  const pattern = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`);
  const raw = pattern.exec(attributes)?.[1];
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function resolveSchemaPath(config: PulseConfig): string | null {
  const candidates = [
    config.schemaPath,
    path.join(config.rootDir, 'backend/prisma/schema.prisma'),
    path.join(config.rootDir, 'worker/prisma/schema.prisma'),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function parsePrismaModels(schema: string): PrismaModel[] {
  const models: PrismaModel[] = [];
  const modelPattern = /model\s+(\w+)\s+\{([\s\S]*?)\n\s*\}/g;
  let modelMatch: RegExpExecArray | null;

  while ((modelMatch = modelPattern.exec(schema))) {
    const [, name, body] = modelMatch;
    const fields: PrismaField[] = [];
    let tableName = name;

    for (const rawLine of body.split('\n')) {
      const line = stripLineComment(rawLine).trim();
      if (!line) {
        continue;
      }
      const mapMatch = /^@@map\("([^"]+)"\)/.exec(line);
      if (mapMatch) {
        tableName = mapMatch[1];
        continue;
      }
      if (line.startsWith('@@')) {
        continue;
      }

      const fieldMatch = /^(\w+)\s+([^\s]+)(.*)$/.exec(line);
      if (!fieldMatch) {
        continue;
      }
      const [, fieldName, rawType, attributes] = fieldMatch;
      const isList = rawType.endsWith('[]');
      const isOptional = rawType.endsWith('?');
      const type = rawType.replace(/\[\]|\?$/g, '');
      fields.push({
        name: fieldName,
        type,
        isList,
        isOptional,
        columnName: extractAttributeValue(attributes, 'map') ?? fieldName,
        attributes,
      });
    }

    models.push({ name, tableName, fields });
  }

  return models;
}

function buildRelationInvariants(models: PrismaModel[]): RelationInvariant[] {
  const byName = new Map(models.map((model) => [model.name, model]));
  const invariants: RelationInvariant[] = [];

  for (const childModel of models) {
    for (const relationField of childModel.fields) {
      if (relationField.isList || !relationField.attributes.includes('@relation')) {
        continue;
      }
      const parentModel = byName.get(relationField.type);
      if (!parentModel) {
        continue;
      }
      const localFieldNames = extractBracketList(relationField.attributes, 'fields');
      const referencedFieldNames = extractBracketList(relationField.attributes, 'references');
      if (localFieldNames.length === 0 || localFieldNames.length !== referencedFieldNames.length) {
        continue;
      }

      const localFields = localFieldNames
        .map((fieldName) => childModel.fields.find((field) => field.name === fieldName))
        .filter((field): field is PrismaField => Boolean(field));
      const referencedFields = referencedFieldNames
        .map((fieldName) => parentModel.fields.find((field) => field.name === fieldName))
        .filter((field): field is PrismaField => Boolean(field));
      if (
        localFields.length !== localFieldNames.length ||
        referencedFields.length !== referencedFieldNames.length
      ) {
        continue;
      }

      invariants.push({ childModel, parentModel, relationField, localFields, referencedFields });
    }
  }

  return invariants;
}

function buildWeakNumericInvariants(models: PrismaModel[]): WeakNumericInvariant[] {
  const numericTypes = new Set(['BigInt', 'Decimal', 'Float', 'Int']);
  const weakNegativeBalanceName = /(^|_)(available|balance|saldo)(_|$)/i;

  return models.flatMap((model) =>
    model.fields
      .filter((field) => numericTypes.has(field.type) && weakNegativeBalanceName.test(field.name))
      .map((field) => ({ model, field })),
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function parseCount(rows: Array<Record<string, unknown>>): number {
  const value = rows[0]?.cnt;
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    return Number.parseInt(value, 10) || 0;
  }
  return 0;
}

function buildRelationCountSql(invariant: RelationInvariant): string {
  const child = quoteIdentifier(invariant.childModel.tableName);
  const parent = quoteIdentifier(invariant.parentModel.tableName);
  const joinPredicate = invariant.localFields
    .map((localField, index) => {
      const referencedField = invariant.referencedFields[index];
      return `child.${quoteIdentifier(localField.columnName)} = parent.${quoteIdentifier(referencedField.columnName)}`;
    })
    .join(' AND ');
  const localFieldPresentPredicate = invariant.localFields
    .map((field) => `child.${quoteIdentifier(field.columnName)} IS NOT NULL`)
    .join(' AND ');
  const parentMissingPredicate = invariant.referencedFields
    .map((field) => `parent.${quoteIdentifier(field.columnName)} IS NULL`)
    .join(' AND ');

  return [
    'SELECT COUNT(*) AS cnt',
    `  FROM ${child} child`,
    `  LEFT JOIN ${parent} parent ON ${joinPredicate}`,
    ` WHERE ${localFieldPresentPredicate}`,
    `   AND ${parentMissingPredicate}`,
  ].join('\n');
}

function buildWeakNumericCountSql(invariant: WeakNumericInvariant): string {
  return [
    'SELECT COUNT(*) AS cnt',
    `  FROM ${quoteIdentifier(invariant.model.tableName)}`,
    ` WHERE ${quoteIdentifier(invariant.field.columnName)} < 0`,
  ].join('\n');
}

async function runCountQuery(sql: string): Promise<number | null> {
  try {
    return parseCount(await dbQuery(sql, []));
  } catch {
    return null;
  }
}

/** Check data integrity. */
export async function checkDataIntegrity(config: PulseConfig): Promise<Break[]> {
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const schemaPath = resolveSchemaPath(config);
  if (!schemaPath) {
    return [];
  }

  const models = parsePrismaModels(fs.readFileSync(schemaPath, 'utf8'));
  const breaks: Break[] = [];
  const baseFile = 'scripts/pulse/parsers/data-integrity.ts';

  for (const invariant of buildRelationInvariants(models)) {
    const count = await runCountQuery(buildRelationCountSql(invariant));
    if (count === null || count === 0) {
      continue;
    }
    breaks.push({
      type: 'DATA_RELATION_ORPHANED_RECORD',
      severity: 'high',
      file: baseFile,
      line: 0,
      source: 'schema-derived:prisma-relation',
      description:
        `${count} row(s) violate Prisma relation ` +
        `${invariant.childModel.name}.${invariant.relationField.name}`,
      detail:
        `Schema-derived invariant: ${invariant.childModel.name}.` +
        `${invariant.relationField.name} references ${invariant.parentModel.name}. Count: ${count}`,
    });
  }

  for (const invariant of buildWeakNumericInvariants(models)) {
    const count = await runCountQuery(buildWeakNumericCountSql(invariant));
    if (count === null || count === 0) {
      continue;
    }
    breaks.push({
      type: 'DATA_NEGATIVE_NUMERIC_WEAK_SIGNAL',
      severity: 'low',
      file: baseFile,
      line: 0,
      source: 'legacy-weak-sensor:data-integrity:needs_schema_owner_review',
      description:
        `${count} row(s) have negative values in discovered numeric field ` +
        `${invariant.model.name}.${invariant.field.name}`,
      detail:
        'Weak schema-discovered signal only; negative numeric values can be valid in some ledgers. ' +
        `Field: ${invariant.model.name}.${invariant.field.name}. Count: ${count}`,
    });
  }

  return breaks;
}
