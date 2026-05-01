import { safeJoin } from './safe-path';
import * as path from 'path';
import ts from 'typescript';
import type {
  PulseConfig,
  PulseParserContract,
  PulseParserDefinition,
  PulseParserInventory,
} from './types';
import { pathExists, readDir, readTextFile, statPath } from './safe-fs';
import { discoverPlugins, loadPlugin } from './plugin-system';

interface LoadParserInventoryOptions {
  includeParser?: (name: string) => boolean;
}

const PARSER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EXPORTED_FUNCTION_RE = /export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
const EXPORTED_CONST_FUNCTION_RE =
  /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g;
const DEFAULT_IDENTIFIER_RE = /export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;?/;
const PARSER_EXPORT_RE = /^check[A-Z0-9_]/;
const DECLARED_METADATA_EXPORTS = new Set(['parserMetadata', 'parserDefinition', 'pulseParser']);
const DECLARED_PARSER_OBJECT_RE = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{/g;
const STRING_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*['"]([^'"]+)['"]`);
const NUMBER_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*(0(?:\\.\\d+)?|1(?:\\.0+)?|\\.\\d+)`);
const FUNCTION_REFERENCE_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)`);

type ParserDiscoveryAuthority =
  | 'declared_metadata'
  | 'declared_export'
  | 'plugin_registry'
  | 'plugin_sensor'
  | 'legacy_weak_check_export'
  | 'helper';

interface ParserOperationalMetadata {
  confidence: number | null;
  declaredExport: string | null;
  dependencies: string[];
  discoveryAuthority: ParserDiscoveryAuthority;
  evidenceKind: string | null;
  inputs: string[];
  legacyCompatibility: boolean;
  outputs: string[];
  pluginId: string | null;
  schema: unknown | null;
  sourceKind: 'filesystem_module' | 'plugin_parser' | 'plugin_sensor';
}

type ParserContractWithOperationalMetadata = PulseParserContract & ParserOperationalMetadata;
type ParserDefinitionWithOperationalMetadata = PulseParserDefinition & ParserOperationalMetadata;

interface PluginParserProvider {
  parsers?: () => unknown;
  sensors?: () => unknown;
}

type PluginParserSurface = 'parsers' | 'sensors';

type PluginParserDefinitionInput = Omit<PulseParserDefinition, 'file'> & {
  confidence?: unknown;
  dependencies?: unknown;
  evidenceKind?: unknown;
  file?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  schema?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isPluginParserDefinition(value: unknown): value is PluginParserDefinitionInput {
  return isRecord(value) && typeof value.name === 'string' && typeof value.fn === 'function';
}

function toPluginParserDefinitions(value: unknown): PluginParserDefinitionInput[] | null {
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

interface DeclaredParserExport {
  authority: Exclude<ParserDiscoveryAuthority, 'helper' | 'legacy_weak_check_export'>;
  exportName: string;
  metadata: Omit<ParserOperationalMetadata, 'discoveryAuthority' | 'legacyCompatibility'>;
}

function collectMatches(source: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const value = match[1];
    if (value) {
      matches.push(value);
    }
  }
  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractConstObjectSource(source: string, exportName: string): string | null {
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

function extractStringProperty(objectSource: string, property: string): string | null {
  return objectSource.match(STRING_PROPERTY_RE(property))?.[1] ?? null;
}

function extractNumberProperty(objectSource: string, property: string): number | null {
  const rawValue = objectSource.match(NUMBER_PROPERTY_RE(property))?.[1];
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function extractStringArrayProperty(objectSource: string, property: string): string[] {
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

function extractSchemaProperty(objectSource: string): unknown | null {
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

function extractFunctionReferenceProperty(objectSource: string, property: string): string | null {
  return objectSource.match(FUNCTION_REFERENCE_PROPERTY_RE(property))?.[1] ?? null;
}

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

function buildOperationalMetadata(
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

function getOperationalMetadata(contract: PulseParserContract): ParserOperationalMetadata {
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

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function operationalMetadataFromPluginDefinition(
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

function buildParserContract(
  rootDir: string,
  parsersDir: string,
  fileName: string,
): ParserContractWithOperationalMetadata {
  const name = fileName.replace(/\.ts$/, '');
  const file = safeJoin(parsersDir, fileName);
  const source = readTextFile(file, 'utf8');
  const exportedFunctions = [
    ...collectMatches(source, EXPORTED_FUNCTION_RE),
    ...collectMatches(source, EXPORTED_CONST_FUNCTION_RE),
  ].sort();
  const declaredParserExports = readDeclaredParserMetadata(source, exportedFunctions);
  const explicitParserExports = exportedFunctions.filter((exportName) =>
    PARSER_EXPORT_RE.test(exportName),
  );
  const defaultIdentifier = source.match(DEFAULT_IDENTIFIER_RE)?.[1];
  const defaultParserExport =
    defaultIdentifier && PARSER_EXPORT_RE.test(defaultIdentifier) ? ['default'] : [];
  const declaredParserExportNames = declaredParserExports.map(
    (declaration) => declaration.exportName,
  );
  const legacyParserExports = [...defaultParserExport, ...explicitParserExports].filter(
    (value, index, values) => values.indexOf(value) === index,
  );
  const parserExports =
    declaredParserExportNames.length > 0
      ? declaredParserExportNames.filter((value, index, values) => values.indexOf(value) === index)
      : legacyParserExports;
  const sourceMtime = pathExists(file) ? statPath(file).mtime.toISOString() : null;
  const relFile = path.relative(rootDir, file);

  if (parserExports.length > 0) {
    const primaryDeclaration = declaredParserExports[0];
    const metadata = primaryDeclaration
      ? buildOperationalMetadata({
          ...primaryDeclaration.metadata,
          discoveryAuthority: primaryDeclaration.authority,
        })
      : buildOperationalMetadata({
          confidence: 0.35,
          discoveryAuthority: 'legacy_weak_check_export',
          evidenceKind: 'legacy-static-export',
          legacyCompatibility: true,
          outputs: ['breaks'],
        });

    return {
      name,
      file: relFile,
      kind: 'active_parser',
      parserExports,
      exportedFunctions,
      proof: primaryDeclaration
        ? `active parser contract from declared parser metadata/export: ${parserExports.join(', ')}`
        : `legacy weak compatibility parser contract from check* export: ${parserExports.join(', ')}; not operational authority`,
      sourceMtime,
      ...metadata,
    };
  }

  return {
    name,
    file: relFile,
    kind: 'helper',
    parserExports: [],
    exportedFunctions,
    proof:
      exportedFunctions.length > 0
        ? `helper module: no declared parser metadata and no legacy check* export`
        : 'helper module: no declared parser metadata and no exported parser function',
    sourceMtime,
    ...buildOperationalMetadata({ discoveryAuthority: 'helper' }),
  };
}

function buildPluginParserContract(
  rootDir: string,
  pluginId: string,
  entrypoint: string,
  surface: PluginParserSurface,
  parserDefinition: PluginParserDefinitionInput,
): ParserContractWithOperationalMetadata {
  const sourceMtime = pathExists(entrypoint) ? statPath(entrypoint).mtime.toISOString() : null;
  const metadata = operationalMetadataFromPluginDefinition(pluginId, surface, parserDefinition);

  return {
    name: parserDefinition.name,
    file: path.relative(rootDir, entrypoint),
    kind: 'active_parser',
    parserExports: [`plugin:${pluginId}`],
    exportedFunctions: [surface],
    proof: `active parser contract registered dynamically by plugin ${pluginId} ${surface}`,
    sourceMtime,
    ...metadata,
  };
}

function discoverFilesystemParserContracts(
  rootDir: string,
): ParserContractWithOperationalMetadata[] {
  const parsersDir = safeJoin(rootDir, 'scripts', 'pulse', 'parsers');
  const files = pathExists(parsersDir)
    ? readDir(parsersDir).filter((file) => file.endsWith('.ts'))
    : [];

  return files
    .map((file) => buildParserContract(rootDir, parsersDir, file))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parserSurfacesForProvider(provider: PluginParserProvider): PluginParserSurface[] {
  return (['parsers', 'sensors'] as const).filter(
    (surface) => typeof provider[surface] === 'function',
  );
}

function discoverPluginParserContracts(rootDir: string): ParserContractWithOperationalMetadata[] {
  const contracts: ParserContractWithOperationalMetadata[] = [];

  for (const pluginDescriptor of discoverPlugins(rootDir)) {
    const plugin = loadPlugin(pluginDescriptor.path);
    if (!plugin) {
      continue;
    }

    const provider = plugin as typeof plugin & PluginParserProvider;
    for (const surface of parserSurfacesForProvider(provider)) {
      let definitions: PluginParserDefinitionInput[] | null = null;
      try {
        definitions = toPluginParserDefinitions(provider[surface]?.());
      } catch {
        definitions = null;
      }
      if (!definitions) {
        continue;
      }

      for (const definition of definitions) {
        if (!PARSER_NAME_RE.test(definition.name)) {
          continue;
        }
        contracts.push(
          buildPluginParserContract(rootDir, plugin.id, pluginDescriptor.path, surface, definition),
        );
      }
    }
  }

  return contracts.sort((left, right) => left.name.localeCompare(right.name));
}

/** Discover parser module, plugin, and sensor contracts from the live registry. */
export function discoverParserContracts(rootDir: string): PulseParserContract[] {
  return [
    ...discoverFilesystemParserContracts(rootDir),
    ...discoverPluginParserContracts(rootDir),
  ].sort((left, right) => left.name.localeCompare(right.name));
}

function callPluginParserSurface(
  provider: PluginParserProvider,
  surface: PluginParserSurface,
): PluginParserDefinitionInput[] | null {
  const readDefinitions = provider[surface];
  if (typeof readDefinitions !== 'function') {
    return null;
  }
  return toPluginParserDefinitions(readDefinitions());
}
import "./__companions__/parser-registry.companion";
