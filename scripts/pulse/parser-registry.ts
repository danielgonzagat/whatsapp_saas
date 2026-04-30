import { safeJoin } from './safe-path';
import * as path from 'path';
import type {
  PulseConfig,
  PulseParserContract,
  PulseParserDefinition,
  PulseParserInventory,
} from './types';
import { pathExists, readDir, readTextFile, statPath } from './safe-fs';

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
const STRING_ARRAY_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*\\[([^\\]]*)\\]`, 'm');
const FUNCTION_REFERENCE_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)`);

type ParserDiscoveryAuthority =
  | 'declared_metadata'
  | 'declared_export'
  | 'legacy_weak_check_export'
  | 'helper';

interface ParserOperationalMetadata {
  confidence: number | null;
  declaredExport: string | null;
  discoveryAuthority: ParserDiscoveryAuthority;
  evidenceKind: string | null;
  inputs: string[];
  legacyCompatibility: boolean;
  outputs: string[];
  pluginId: string | null;
}

type ParserContractWithOperationalMetadata = PulseParserContract & ParserOperationalMetadata;

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
  const rawItems = objectSource.match(STRING_ARRAY_PROPERTY_RE(property))?.[1];
  if (!rawItems) {
    return [];
  }

  const values: string[] = [];
  const itemPattern = /['"]([^'"]+)['"]/g;
  for (const match of rawItems.matchAll(itemPattern)) {
    const value = match[1];
    if (value) {
      values.push(value);
    }
  }

  return values;
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
          evidenceKind: extractStringProperty(objectSource, 'evidenceKind'),
          inputs: extractStringArrayProperty(objectSource, 'inputs'),
          outputs: extractStringArrayProperty(objectSource, 'outputs'),
          pluginId: extractStringProperty(objectSource, 'pluginId'),
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
          evidenceKind: extractStringProperty(objectSource, 'evidenceKind'),
          inputs: extractStringArrayProperty(objectSource, 'inputs'),
          outputs: extractStringArrayProperty(objectSource, 'outputs'),
          pluginId: extractStringProperty(objectSource, 'pluginId'),
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
    discoveryAuthority: overrides.discoveryAuthority ?? 'helper',
    evidenceKind: overrides.evidenceKind ?? null,
    inputs: overrides.inputs ?? [],
    legacyCompatibility: overrides.legacyCompatibility ?? false,
    outputs: overrides.outputs ?? [],
    pluginId: overrides.pluginId ?? null,
  };
}

function getOperationalMetadata(contract: PulseParserContract): ParserOperationalMetadata {
  const enriched = contract as ParserContractWithOperationalMetadata;
  return buildOperationalMetadata({
    confidence: enriched.confidence,
    declaredExport: enriched.declaredExport,
    discoveryAuthority: enriched.discoveryAuthority,
    evidenceKind: enriched.evidenceKind,
    inputs: enriched.inputs,
    legacyCompatibility: enriched.legacyCompatibility,
    outputs: enriched.outputs,
    pluginId: enriched.pluginId,
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

/** Discover parser module contracts without loading the modules. */
export function discoverParserContracts(rootDir: string): PulseParserContract[] {
  const parsersDir = safeJoin(rootDir, 'scripts', 'pulse', 'parsers');
  const files = pathExists(parsersDir)
    ? readDir(parsersDir).filter((file) => file.endsWith('.ts'))
    : [];

  return files
    .map((file) => buildParserContract(rootDir, parsersDir, file))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function resolveParserFunction(
  mod: Record<string, unknown>,
  contract: PulseParserContract,
): PulseParserDefinition['fn'] | null {
  for (const exportName of contract.parserExports) {
    const value = mod[exportName];
    if (typeof value === 'function') {
      return value as PulseParserDefinition['fn'];
    }
    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.fn === 'function') {
        return candidate.fn as PulseParserDefinition['fn'];
      }
      if (typeof candidate.run === 'function') {
        return candidate.run as PulseParserDefinition['fn'];
      }
      if (typeof candidate.check === 'function') {
        return candidate.check as PulseParserDefinition['fn'];
      }
    }
  }

  const namedParser = Object.entries(mod).find(
    ([exportName, value]) => PARSER_EXPORT_RE.test(exportName) && typeof value === 'function',
  );
  if (namedParser) {
    return namedParser[1] as PulseParserDefinition['fn'];
  }

  return null;
}

/** Load parser inventory. */
export function loadParserInventory(
  config: PulseConfig,
  options: LoadParserInventoryOptions = {},
): PulseParserInventory {
  const generatedAt = new Date().toISOString();
  const contracts = discoverParserContracts(config.rootDir);
  const checks = contracts
    .filter((contract) => contract.kind === 'active_parser')
    .map((contract) => contract.name);
  const helperFilesSkipped = contracts
    .filter((contract) => contract.kind === 'helper')
    .map((contract) => contract.name);
  const loadedChecks: PulseParserDefinition[] = [];
  const unavailableChecks: PulseParserInventory['unavailableChecks'] = [];

  for (const contract of contracts.filter((item) => item.kind === 'active_parser')) {
    const name = contract.name;
    if (options.includeParser && !options.includeParser(name)) {
      continue;
    }

    if (!PARSER_NAME_RE.test(name)) {
      unavailableChecks.push({
        name,
        file: name,
        reason: 'Parser module name failed safe-identifier validation.',
      });
      continue;
    }

    const file = safeJoin(config.rootDir, 'scripts', 'pulse', 'parsers', `${name}.ts`);

    try {
      const mod = require(file);
      const fn = resolveParserFunction(mod, contract);

      if (!fn) {
        unavailableChecks.push({
          name,
          file: path.relative(config.rootDir, file),
          reason: 'Parser module did not export a callable check function.',
        });
        continue;
      }

      loadedChecks.push({
        name,
        file: path.relative(config.rootDir, file),
        fn,
        ...getOperationalMetadata(contract),
      });
    } catch (error) {
      unavailableChecks.push({
        name,
        file: path.relative(config.rootDir, file),
        reason: (error as Error).message || 'Unknown parser load failure',
      });
    }
  }

  return {
    contracts,
    generatedAt,
    discoveredChecks: checks,
    loadedChecks,
    unavailableChecks,
    helperFilesSkipped,
  };
}
