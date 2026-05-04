/**
 * PULSE Parser 52: Schema-derived numeric consistency probes
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * This parser intentionally avoids product/table-specific SQL. It derives
 * runtime probes from the observed Prisma schema and emits compatibility
 * Breaks only after signal/evidence/predicate/diagnostic synthesis.
 */

import * as fs from 'fs';
import * as path from 'path';

import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { dbQuery } from './runtime-utils';

interface PrismaField {
  name: string;
  type: string;
  columnName: string;
  attributes: string;
}

interface PrismaModel {
  name: string;
  tableName: string;
  fields: PrismaField[];
}

interface NumericProbe {
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

function parsePrismaModels(schema: string): PrismaModel[] {
  const models: PrismaModel[] = [];
  const lines = schema.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = stripLineComment(lines[index] ?? '').trim();
    if (!line.startsWith('model ') || !line.includes('{')) {
      index += 1;
      continue;
    }

    const name = line.slice('model '.length, line.indexOf('{')).trim().split(/\s+/)[0];
    if (!name) {
      index += 1;
      continue;
    }

    let tableName = name;
    const fields: PrismaField[] = [];
    index += 1;

    while (index < lines.length) {
      const rawLine = lines[index] ?? '';
      const line = stripLineComment(rawLine).trim();
      index += 1;
      if (line === '}') {
        break;
      }
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

      const [fieldName, rawType, ...attributeParts] = line.split(/\s+/);
      if (!fieldName || !rawType) {
        continue;
      }
      const attributes = attributeParts.join(' ');
      fields.push({
        name: fieldName,
        type: rawType.replace(/\[\]|\?$/g, ''),
        columnName: extractAttributeValue(attributes, 'map') ?? fieldName,
        attributes,
      });
    }

    models.push({ name, tableName, fields });
  }

  return models;
}

function schemaPathFor(config: PulseConfig): string | null {
  if (config.schemaPath && fs.existsSync(config.schemaPath)) {
    return config.schemaPath;
  }
  return null;
}

function buildNumericProbes(models: PrismaModel[]): NumericProbe[] {
  const numericTypes = new Set(['BigInt', 'Decimal', 'Float', 'Int']);
  return models.flatMap((model) =>
    model.fields
      .filter(
        (field) =>
          numericTypes.has(field.type) &&
          !field.attributes.includes('@id') &&
          !field.attributes.includes('@unique'),
      )
      .map((field) => ({ model, field })),
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildNegativeNumericCountSql(probe: NumericProbe): string {
  return [
    'SELECT COUNT(*) AS cnt',
    `  FROM ${quoteIdentifier(probe.model.tableName)}`,
    ` WHERE ${quoteIdentifier(probe.field.columnName)} < 0`,
  ].join('\n');
}

function parseCount(rows: Array<Record<string, unknown>>): number {
  const value = rows[0]?.cnt;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  return 0;
}

async function runCountQuery(sql: string): Promise<number | null> {
  try {
    return parseCount(await dbQuery(sql, []));
  } catch {
    return null;
  }
}

interface SchemaNumericProbeOptions {
  source: string;
  detector: string;
  surface: string;
}

function synthesizeProbeBreak(signal: PulseSignalEvidence, surface: string): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );

  return {
    type: diagnostic.id,
    severity: 'low',
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface,
  };
}

export async function runSchemaDerivedNumericConsistencyProbes(
  config: PulseConfig,
  options: SchemaNumericProbeOptions = {
    source: 'schema-derived:numeric-runtime-probe',
    detector: 'negative-numeric-observation',
    surface: 'schema-derived-numeric-consistency',
  },
): Promise<Break[]> {
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const schemaPath = schemaPathFor(config);
  if (!schemaPath) {
    return [];
  }

  const breaks: Break[] = [];
  const models = parsePrismaModels(fs.readFileSync(schemaPath, 'utf8'));

  for (const probe of buildNumericProbes(models)) {
    const count = await runCountQuery(buildNegativeNumericCountSql(probe));
    if (count === null || count === 0) {
      continue;
    }

    breaks.push(
      synthesizeProbeBreak(
        {
          source: options.source,
          detector: options.detector,
          truthMode: 'observed',
          summary: 'Runtime probe observed negative values in schema-discovered numeric field',
          detail: `Model=${probe.model.name}; field=${probe.field.name}; observedRows=${count}`,
          location: {
            file: path.relative(config.rootDir, schemaPath),
            line: 0,
          },
        },
        options.surface,
      ),
    );
  }

  return breaks;
}

/** Check schema-derived numeric consistency probes. */
export async function checkE2eWithdrawal(config: PulseConfig): Promise<Break[]> {
  return runSchemaDerivedNumericConsistencyProbes(config);
}
