import { safeJoin } from '../safe-path';
import * as path from 'path';
import { pathExists, readDir, readTextFile, statPath } from '../safe-fs';
import { loadPlugin } from '../plugin-system/main';
import { discoverPlugins } from '../plugin-system/schema-discovery';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverSourceExtensionsFromObservedTypescript } from '../dynamic-reality-kernel/token-evidence';
import {
  DEFAULT_IDENTIFIER_RE,
  EXPORTED_CONST_FUNCTION_RE,
  EXPORTED_FUNCTION_RE,
  PARSER_EXPORT_RE,
  PARSER_NAME_RE,
  type ParserContractWithOperationalMetadata,
  type PluginParserDefinitionInput,
  type PluginParserProvider,
  type PluginParserSurface,
} from './types';
import {
  buildOperationalMetadata,
  collectMatches,
  readDeclaredParserMetadata,
  toPluginParserDefinitions,
  operationalMetadataFromPluginDefinition,
} from './discovery-helpers';

function buildParserContract(
  rootDir: string,
  parsersDir: string,
  fileName: string,
): ParserContractWithOperationalMetadata {
  const name = path.parse(fileName).name;
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
    declaredParserExportNames.length > deriveZeroValue()
      ? declaredParserExportNames.filter((value, index, values) => values.indexOf(value) === index)
      : legacyParserExports;
  const sourceMtime = pathExists(file) ? statPath(file).mtime.toISOString() : null;
  const relFile = path.relative(rootDir, file);

  if (parserExports.length > deriveZeroValue()) {
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
          legacyCompatibility: !!deriveUnitValue(),
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
      exportedFunctions.length > deriveZeroValue()
        ? `helper module: no declared parser metadata and no legacy check* export`
        : 'helper module: no declared parser metadata and no exported parser function',
    sourceMtime,
    ...buildOperationalMetadata({ discoveryAuthority: 'helper' }),
  };
}

export function buildPluginParserContract(
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

let _pluginParserSurfaceLabels: Set<string> | undefined;
export function getPluginParserSurfaceLabels(): Set<string> {
  if (!_pluginParserSurfaceLabels) {
    _pluginParserSurfaceLabels = deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/parser-registry.ts',
      'PluginParserSurface',
    );
  }
  return _pluginParserSurfaceLabels;
}

export function parserSurfacesForProvider(provider: PluginParserProvider): PluginParserSurface[] {
  return [...getPluginParserSurfaceLabels()].filter(
    (surface) => typeof provider[surface as PluginParserSurface] === 'function',
  ) as PluginParserSurface[];
}

export function discoverFilesystemParserContracts(
  rootDir: string,
): ParserContractWithOperationalMetadata[] {
  const parsersDir = safeJoin(rootDir, 'scripts', 'pulse', 'parsers');
  const tsExtensions = discoverSourceExtensionsFromObservedTypescript();
  const files = pathExists(parsersDir)
    ? readDir(parsersDir).filter((file) => [...tsExtensions].some((ext) => file.endsWith(ext)))
    : [];

  return files
    .map((file) => buildParserContract(rootDir, parsersDir, file))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function discoverPluginParserContracts(
  rootDir: string,
): ParserContractWithOperationalMetadata[] {
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
