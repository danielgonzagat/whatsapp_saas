import * as path from 'path';
import { safeJoin } from '../../safe-path';
import { pathExists, readTextFile, statPath } from '../../safe-fs';
import { collectMatches } from './extraction';
import {
  DEFAULT_IDENTIFIER_RE,
  EXPORTED_CONST_FUNCTION_RE,
  EXPORTED_FUNCTION_RE,
  PARSER_EXPORT_RE,
} from './constants';
import { readDeclaredParserMetadata, buildOperationalMetadata } from './declared-metadata';
import { operationalMetadataFromPluginDefinition } from './plugin-metadata';
import type {
  ParserContractWithOperationalMetadata,
  PluginParserDefinitionInput,
  PluginParserSurface,
} from './types';

export function buildParserContract(
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
