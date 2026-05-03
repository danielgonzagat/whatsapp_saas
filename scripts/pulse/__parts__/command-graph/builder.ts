import * as path from 'node:path';
import { pathExists, readTextFile, statPath } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import type { PulseCommandGraph, PulseDiscoveredCommand } from './types';
import { uniqueSorted, toRelativePath } from './types';
import {
  discoverStaticSources,
  inferInstallCommands,
  inferScriptCommands,
  inferTsconfigCommands,
} from './discovery';
import { dockerCommands, workflowCommands } from './docker-workflow';
import { environmentVariablesForSource, mergeEnvironmentVariables } from './env';

function dedupeCommands(commands: PulseDiscoveredCommand[]): PulseDiscoveredCommand[] {
  const byId = new Map<string, PulseDiscoveredCommand>();
  for (const command of commands) {
    byId.set(command.id, command);
  }
  return [...byId.values()].sort((left, right) => {
    const purpose = left.purpose.localeCompare(right.purpose);
    if (purpose !== 0) {
      return purpose;
    }
    return left.id.localeCompare(right.id);
  });
}

export function buildPulseCommandGraph(rootDir = process.cwd()): PulseCommandGraph {
  const absoluteRoot = path.resolve(rootDir);
  const sources = discoverStaticSources(absoluteRoot);
  const packageJsonFiles = sources
    .filter((source) => source.sourceKind === 'package-json')
    .map((source) => source.relativePath);
  const commands: PulseDiscoveredCommand[] = [
    ...inferInstallCommands(absoluteRoot, packageJsonFiles),
    ...inferScriptCommands(absoluteRoot, packageJsonFiles),
    ...inferTsconfigCommands(absoluteRoot, sources),
  ];
  const environmentVariables: PulseDiscoveredEnvironmentVariable[] = [];

  for (const source of sources) {
    const absolutePath = safeJoin(absoluteRoot, source.relativePath);
    if (!pathExists(absolutePath) || !statPath(absolutePath).isFile()) {
      continue;
    }
    const text = readTextFile(absolutePath, 'utf8');
    environmentVariables.push(...environmentVariablesForSource(source, text));
    if (source.sourceKind === 'dockerfile') {
      commands.push(...dockerCommands(source.relativePath, text));
    }
    if (source.sourceKind === 'github-workflow') {
      commands.push(...workflowCommands(source.relativePath, text));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    commands: dedupeCommands(commands),
    environmentVariables: mergeEnvironmentVariables(environmentVariables),
    scannedSources: uniqueSorted(
      sources.map((source) =>
        toRelativePath(absoluteRoot, safeJoin(absoluteRoot, source.relativePath)),
      ),
    ),
  };
}
