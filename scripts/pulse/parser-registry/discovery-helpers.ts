import * as path from 'path';
import * as ts from 'typescript';
import {
  DECLARED_METADATA_EXPORTS,
  DECLARED_PARSER_OBJECT_RE,
  EXPORTED_FUNCTION_RE,
  EXPORTED_CONST_FUNCTION_RE,
  FUNCTION_REFERENCE_PROPERTY_RE,
  NUMBER_PROPERTY_RE,
  STRING_PROPERTY_RE,
  type DeclaredParserExport,
  type ParserDiscoveryAuthority,
  type ParserOperationalMetadata,
  type PluginParserDefinitionInput,
  type PluginParserSurface,
} from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function isPluginParserDefinition(value: unknown): value is PluginParserDefinitionInput {
  return isRecord(value) && typeof value.name === 'string' && typeof value.fn === 'function';
}

export function toPluginParserDefinitions(value: unknown): PluginParserDefinitionInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const definitions: PluginParserDefinitionInput[] = [];
  for (const item of value) {
    if (!isPluginParserDefinition(item)) {
      return null;
    }
    definitions.push(item);
  }

  return definitions;
}

export function collectMatches(source: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const value = match[1];
    if (value) {
      matches.push(value);
    }
  }
  return matches;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractConstObjectSource(source: string, exportName: string): string | null {
  const marker = new RegExp(`export\\s+const\\s+${escapeRegExp(exportName)}\\s*=\\s*\\{`);
  const match = marker.exec(source);
  if (!match) {
    return null;
  }

  const start = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function extractStringProperty(objectSource: string, property: string): string | null {
  return objectSource.match(STRING_PROPERTY_RE(property))?.[1] ?? null;
}

export function extractNumberProperty(objectSource: string, property: string): number | null {
  const rawValue = objectSource.match(NUMBER_PROPERTY_RE(property))?.[1];
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

export function extractStringArrayProperty(objectSource: string, property: string): string[] {
  const sourceFile = ts.createSourceFile(
    'pulse-parser-object.ts',
    `const pulseParserObject = ${objectSource};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(ts.isVariableStatement)?.declarationList
    .declarations[0];
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return [];
  }

  const propertyAssignment = initializer.properties.find((item): item is ts.PropertyAssignment => {
    return ts.isPropertyAssignment(item) && item.name.getText(sourceFile) === property;
  });
  if (!propertyAssignment || !ts.isArrayLiteralExpression(propertyAssignment.initializer)) {
    return [];
  }

  return propertyAssignment.initializer.elements.flatMap((element) => {
    return ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)
      ? [element.text]
      : [];
  });
}

export function extractSchemaProperty(objectSource: string): unknown | null {
  const sourceFile = ts.createSourceFile(
    'pulse-parser-object.ts',
    `const pulseParserObject = ${objectSource};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(ts.isVariableStatement)?.declarationList
    .declarations[0];
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return null;
  }

  const propertyAssignment = initializer.properties.find((item): item is ts.PropertyAssignment => {
    return ts.isPropertyAssignment(item) && item.name.getText(sourceFile) === 'schema';
  });
  if (!propertyAssignment) {
    return null;
  }

  if (
    ts.isStringLiteral(propertyAssignment.initializer) ||
    ts.isNoSubstitutionTemplateLiteral(propertyAssignment.initializer)
  ) {
    return propertyAssignment.initializer.text;
  }

  return propertyAssignment.initializer.getText(sourceFile);
}

export function extractFunctionReferenceProperty(
  objectSource: string,
  property: string,
): string | null {
  return objectSource.match(FUNCTION_REFERENCE_PROPERTY_RE(property))?.[1] ?? null;
}

export function readDeclaredParserMetadata(
  source: string,
  exportedFunctions: string[],
): DeclaredParserExport[] {
  const declarations: DeclaredParserExport[] = [];

  for (const exportName of DECLARED_METADATA_EXPORTS) {
    const objectSource = extractConstObjectSource(source, exportName);
    if (!objectSource) {
      continue;
    }

    const parserExport =
      extractStringProperty(objectSource, 'parserExport') ??
      extractStringProperty(objectSource, 'exportName') ??
      extractStringProperty(objectSource, 'functionName');

    if (parserExport && exportedFunctions.includes(parserExport)) {
      declarations.push({
        authority: 'declared_metadata',
        exportName: parserExport,
        metadata: {
          confidence: extractNumberProperty(objectSource, 'confidence'),
          declaredExport: exportName,
          dependencies: extractStringArrayProperty(objectSource, 'dependencies'),
          evidenceKind: extractStringProperty(objectSource, 'evidenceKind'),
          inputs: extractStringArrayProperty(objectSource, 'inputs'),
          outputs: extractStringArrayProperty(objectSource, 'outputs'),
          pluginId: extractStringProperty(objectSource, 'pluginId'),
          schema: extractSchemaProperty(objectSource),
          sourceKind: 'filesystem_module',
        },
      });
    }
  }

  for (const match of source.matchAll(DECLARED_PARSER_OBJECT_RE)) {
    const exportName = match[1];
    if (!exportName || DECLARED_METADATA_EXPORTS.has(exportName)) {
      continue;
    }

    const objectSource = extractConstObjectSource(source, exportName);
    if (!objectSource) {
      continue;
    }

    const parserKind = extractStringProperty(objectSource, 'kind');
    const fnReference = extractFunctionReferenceProperty(objectSource, 'fn');
    const hasOperationalMetadata =
      objectSource.includes('evidenceKind') ||
      objectSource.includes('inputs') ||
      objectSource.includes('outputs') ||
      objectSource.includes('confidence');

    if (parserKind === 'parser' && fnReference && hasOperationalMetadata) {
      declarations.push({
        authority: 'declared_export',
        exportName,
        metadata: {
          confidence: extractNumberProperty(objectSource, 'confidence'),
          declaredExport: exportName,
          dependencies: extractStringArrayProperty(objectSource, 'dependencies'),
          evidenceKind: extractStringProperty(objectSource, 'evidenceKind'),
          inputs: extractStringArrayProperty(objectSource, 'inputs'),
          outputs: extractStringArrayProperty(objectSource, 'outputs'),
          pluginId: extractStringProperty(objectSource, 'pluginId'),
          schema: extractSchemaProperty(objectSource),
          sourceKind: 'filesystem_module',
        },
      });
    }
  }

  return declarations;
}

import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';

export function buildOperationalMetadata(
  overrides: Partial<ParserOperationalMetadata>,
): ParserOperationalMetadata {
  return {
    confidence: overrides.confidence ?? null,
    declaredExport: overrides.declaredExport ?? null,
    dependencies: overrides.dependencies ?? [],
    discoveryAuthority: overrides.discoveryAuthority ?? 'helper',
    evidenceKind: overrides.evidenceKind ?? null,
    inputs: overrides.inputs ?? [],
    legacyCompatibility: overrides.legacyCompatibility ?? !deriveUnitValue(),
    outputs: overrides.outputs ?? [],
    pluginId: overrides.pluginId ?? null,
    schema: overrides.schema ?? null,
    sourceKind: overrides.sourceKind ?? 'filesystem_module',
  };
}

import type { PulseParserContract } from '../types.manifest';
import type { ParserContractWithOperationalMetadata } from './types';

export function getOperationalMetadata(contract: PulseParserContract): ParserOperationalMetadata {
  const enriched = contract as ParserContractWithOperationalMetadata;
  return buildOperationalMetadata({
    confidence: enriched.confidence,
    declaredExport: enriched.declaredExport,
    dependencies: enriched.dependencies,
    discoveryAuthority: enriched.discoveryAuthority,
    evidenceKind: enriched.evidenceKind,
    inputs: enriched.inputs,
    legacyCompatibility: enriched.legacyCompatibility,
    outputs: enriched.outputs,
    pluginId: enriched.pluginId,
    schema: enriched.schema,
    sourceKind: enriched.sourceKind,
  });
}

export function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && item.length > deriveZeroValue(),
      )
    : [];
}

export function numberFromUnknown(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.length > deriveZeroValue() ? value : null;
}

export function operationalMetadataFromPluginDefinition(
  pluginId: string,
  surface: PluginParserSurface,
  definition: PluginParserDefinitionInput,
): ParserOperationalMetadata {
  const authority: ParserDiscoveryAuthority =
    surface === 'sensors' ? 'plugin_sensor' : 'plugin_registry';
  const definitionRecord = definition as Record<string, unknown>;
  return buildOperationalMetadata({
    confidence: numberFromUnknown(definitionRecord.confidence) ?? 0.8,
    declaredExport: surface,
    dependencies: stringArrayFromUnknown(definitionRecord.dependencies),
    discoveryAuthority: authority,
    evidenceKind:
      stringFromUnknown(definitionRecord.evidenceKind) ??
      (surface === 'sensors' ? 'plugin-sensor' : 'plugin-parser'),
    inputs: stringArrayFromUnknown(definitionRecord.inputs),
    outputs: stringArrayFromUnknown(definitionRecord.outputs),
    pluginId,
    schema: definitionRecord.schema ?? null,
    sourceKind: surface === 'sensors' ? 'plugin_sensor' : 'plugin_parser',
  });
}
