import { safeJoin } from '../../safe-path';
import { pathExists, readDir } from '../../safe-fs';
import { discoverPlugins, loadPlugin } from '../../plugin-system';
import { PARSER_NAME_RE } from './constants';
import { buildParserContract, buildPluginParserContract } from './contracts';
import { toPluginParserDefinitions } from './types';
import type {
  ParserContractWithOperationalMetadata,
  PluginParserDefinitionInput,
  PluginParserProvider,
  PluginParserSurface,
} from './types';
import type { PulseParserContract } from '../../types';

export function discoverFilesystemParserContracts(
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
