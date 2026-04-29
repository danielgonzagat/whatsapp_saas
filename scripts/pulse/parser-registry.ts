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
const DEFAULT_FUNCTION_RE = /export\s+default\s+(?:async\s+)?function\b/;
const DEFAULT_IDENTIFIER_RE = /export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;?/;
const PARSER_EXPORT_RE = /^check[A-Z0-9_]/;

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

function buildParserContract(
  rootDir: string,
  parsersDir: string,
  fileName: string,
): PulseParserContract {
  const name = fileName.replace(/\.ts$/, '');
  const file = safeJoin(parsersDir, fileName);
  const source = readTextFile(file, 'utf8');
  const exportedFunctions = [
    ...collectMatches(source, EXPORTED_FUNCTION_RE),
    ...collectMatches(source, EXPORTED_CONST_FUNCTION_RE),
  ].sort();
  const explicitParserExports = exportedFunctions.filter((exportName) =>
    PARSER_EXPORT_RE.test(exportName),
  );
  const defaultExportName = DEFAULT_FUNCTION_RE.test(source) ? ['default'] : [];
  const defaultIdentifier = source.match(DEFAULT_IDENTIFIER_RE)?.[1];
  const defaultParserExport =
    defaultIdentifier && PARSER_EXPORT_RE.test(defaultIdentifier) ? ['default'] : [];
  const parserExports = [
    ...defaultExportName,
    ...defaultParserExport,
    ...explicitParserExports,
  ].filter((value, index, values) => values.indexOf(value) === index);
  const sourceMtime = pathExists(file) ? statPath(file).mtime.toISOString() : null;
  const relFile = path.relative(rootDir, file);

  if (parserExports.length > 0) {
    return {
      name,
      file: relFile,
      kind: 'active_parser',
      parserExports,
      exportedFunctions,
      proof: `active parser contract: ${parserExports.join(', ')}`,
      sourceMtime,
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
        ? `helper module: no exported function matches ${PARSER_EXPORT_RE.source}`
        : 'helper module: no exported parser function',
    sourceMtime,
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
