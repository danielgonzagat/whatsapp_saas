import * as fs from 'fs';
import * as path from 'path';
import type { PulseConfig, PulseParserDefinition, PulseParserInventory } from './types';

interface LoadParserInventoryOptions {
  includeParser?: (name: string) => boolean;
}

const HELPER_PARSERS = new Set([
  'api-parser',
  'backend-parser',
  'facade-detector',
  'hook-registry',
  'runtime-utils',
  'schema-parser',
  'service-tracer',
  'ui-parser',
  'utils',
]);

function discoverParserFiles(rootDir: string): { checks: string[]; helperFilesSkipped: string[] } {
  const parsersDir = path.join(rootDir, 'scripts', 'pulse', 'parsers');
  const files = fs.existsSync(parsersDir)
    ? fs.readdirSync(parsersDir).filter((file) => file.endsWith('.ts'))
    : [];

  const checks: string[] = [];
  const helperFilesSkipped: string[] = [];

  for (const file of files) {
    const name = file.replace(/\.ts$/, '');
    if (HELPER_PARSERS.has(name)) {
      helperFilesSkipped.push(name);
      continue;
    }
    checks.push(name);
  }

  return {
    checks: checks.sort(),
    helperFilesSkipped: helperFilesSkipped.sort(),
  };
}

function resolveParserFunction(mod: Record<string, unknown>): PulseParserDefinition['fn'] | null {
  if (typeof mod.default === 'function') {
    return mod.default as PulseParserDefinition['fn'];
  }

  for (const value of Object.values(mod)) {
    if (typeof value === 'function') {
      return value as PulseParserDefinition['fn'];
    }
  }

  return null;
}

export function loadParserInventory(
  config: PulseConfig,
  options: LoadParserInventoryOptions = {},
): PulseParserInventory {
  const { checks, helperFilesSkipped } = discoverParserFiles(config.rootDir);
  const loadedChecks: PulseParserDefinition[] = [];
  const unavailableChecks: PulseParserInventory['unavailableChecks'] = [];

  for (const name of checks) {
    if (options.includeParser && !options.includeParser(name)) {
      continue;
    }

    const file = path.join(config.rootDir, 'scripts', 'pulse', 'parsers', `${name}.ts`);

    try {
      const mod = require(`./parsers/${name}`);
      const fn = resolveParserFunction(mod);

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
    discoveredChecks: checks,
    loadedChecks,
    unavailableChecks,
    helperFilesSkipped,
  };
}
