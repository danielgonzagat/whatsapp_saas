import type { PulseParserContract } from '../../types';
import type {
  DeclaredParserExport,
  ParserContractWithOperationalMetadata,
  ParserOperationalMetadata,
} from './types';
import { DECLARED_METADATA_EXPORTS, DECLARED_PARSER_OBJECT_RE } from './constants';
import {
  extractConstObjectSource,
  extractStringProperty,
  extractNumberProperty,
  extractStringArrayProperty,
  extractSchemaProperty,
  extractFunctionReferenceProperty,
} from './extraction';

function readDeclaredParserMetadata(
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
    legacyCompatibility: overrides.legacyCompatibility ?? false,
    outputs: overrides.outputs ?? [],
    pluginId: overrides.pluginId ?? null,
    schema: overrides.schema ?? null,
    sourceKind: overrides.sourceKind ?? 'filesystem_module',
  };
}

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

export { readDeclaredParserMetadata };
