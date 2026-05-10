import * as path from 'node:path';
import { pathExists, readTextFile, statPath } from '../safe-fs';
import { safeJoin } from '../lib/safe-path';
import { deriveUnitValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  hasObservedToken,
} from '../dynamic-reality-kernel/token-evidence';
import type {
  PulseCommandGraph,
  PulseDiscoveredCommand,
  PulseDiscoveredEnvironmentVariable,
  CandidateSource,
} from './types';
import {
  discoverStaticSources,
  inferInstallCommands,
  inferScriptCommands,
  inferTsconfigCommands,
  dockerCommands,
  workflowCommands,
  toRelativePath,
  uniqueSorted,
} from './discovery';

const OBSERVED_SECRET_LIKE_TOKEN_CATALOG = [
  'secret',
  'token',
  'password',
  'private',
  'webhook',
] as const;

const OBSERVED_SECRET_COMPOUND_TOKEN_CATALOG = [
  { primary: 'api', secondary: 'key' },
  { primary: 'access', secondary: 'key' },
] as const;

function isEnvNameChar(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  return (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char === '_';
}

function isLikelyEnvName(value: string): boolean {
  if (value.length < deriveUnitValue() + deriveUnitValue() + deriveUnitValue()) {
    return false;
  }
  if (value[0] < 'A' || value[0] > 'Z') {
    return false;
  }
  return [...value].every(isEnvNameChar);
}

function readEnvNameAt(text: string, start: number): string {
  let cursor = start;
  let name = '';
  while (cursor < text.length && isEnvNameChar(text[cursor])) {
    name += text[cursor];
    cursor += 1;
  }
  return isLikelyEnvName(name) ? name : '';
}

function collectNamesAfterMarkers(text: string, markers: string[]): string[] {
  const names: string[] = [];
  for (const marker of markers) {
    let cursor = text.indexOf(marker);
    while (cursor !== -1) {
      const name = readEnvNameAt(text, cursor + marker.length);
      if (name) {
        names.push(name);
      }
      cursor = text.indexOf(marker, cursor + marker.length);
    }
  }
  return names;
}

function collectShellNames(text: string): string[] {
  const names: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '$') {
      continue;
    }
    if (text[index + 1] === '{') {
      const name = readEnvNameAt(text, index + 2);
      if (name) {
        names.push(name);
      }
      continue;
    }
    const name = readEnvNameAt(text, index + 1);
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function collectUppercaseNames(text: string): string[] {
  const names: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (!isEnvNameChar(text[cursor])) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    let name = '';
    while (cursor < text.length && isEnvNameChar(text[cursor])) {
      name += text[cursor];
      cursor += 1;
    }
    const before = text[start - 1];
    const after = text[cursor];
    if (!isEnvNameChar(before) && !isEnvNameChar(after) && isLikelyEnvName(name)) {
      names.push(name);
    }
  }
  return names;
}

function isSecretLikeName(name: string): boolean {
  const tokens = new Set(name.toLowerCase().split('_').filter(Boolean));
  if (hasObservedToken(tokens, [...OBSERVED_SECRET_LIKE_TOKEN_CATALOG])) {
    return true;
  }
  for (const { primary, secondary } of OBSERVED_SECRET_COMPOUND_TOKEN_CATALOG) {
    if (hasObservedToken(tokens, [primary]) && hasObservedToken(tokens, [secondary])) {
      return true;
    }
  }
  return false;
}

function classifyEnvContext(_line: string, trimmed: string): string | null {
  const upperTrimmed = trimmed.toUpperCase();
  if (upperTrimmed.startsWith('ARG ')) {
    const declaration = trimmed.slice(4).trim();
    const [, defaultValue] = declaration.split('=', 2);
    return defaultValue === undefined ? 'docker-arg-required' : 'docker-arg-default';
  }
  if (upperTrimmed.startsWith('ENV ')) {
    return 'docker-env';
  }
  if (!trimmed.startsWith('- ') && trimmed.includes(':')) {
    return 'workflow-env';
  }
  return null;
}

function collectEnvNames(text: string): Map<string, string[]> {
  const names = new Map<string, string[]>();
  const add = (name: string, context: string): void => {
    const current = names.get(name) ?? [];
    current.push(context);
    names.set(name, current);
  };

  for (const name of collectNamesAfterMarkers(text, ['process.env.'])) {
    add(name, 'process.env');
  }
  for (const name of collectNamesAfterMarkers(text, ['secrets.', 'vars.', 'env.'])) {
    add(name, 'github-template');
  }
  for (const name of collectShellNames(text)) {
    add(name, 'shell');
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const dockerContext = classifyEnvContext(line, trimmed);
    if (dockerContext) {
      if (dockerContext.startsWith('docker-arg')) {
        const declaration = trimmed.slice(4).trim();
        const [name] = declaration.split('=', 2);
        if (isLikelyEnvName(name)) {
          add(name, dockerContext);
        }
      } else if (dockerContext === 'docker-env') {
        for (const name of collectUppercaseNames(trimmed.slice(4))) {
          add(name, dockerContext);
        }
      } else if (dockerContext === 'workflow-env') {
        const [candidate] = trimmed.split(':', 1);
        if (isLikelyEnvName(candidate.trim())) {
          add(candidate.trim(), dockerContext);
        }
      }
    }
  }
  return names;
}

function environmentVariablesForSource(
  source: CandidateSource,
  text: string,
): PulseDiscoveredEnvironmentVariable[] {
  return [...collectEnvNames(text).entries()]
    .map(([name, contexts]) => ({
      name,
      sourcePath: source.relativePath,
      sourceKind: source.sourceKind,
      contexts: [...new Set(contexts)].sort(),
      required: contexts.includes('docker-arg-required') || contexts.includes('github-template'),
      secretLike: isSecretLikeName(name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function mergeEnvironmentVariables(
  variables: PulseDiscoveredEnvironmentVariable[],
): PulseDiscoveredEnvironmentVariable[] {
  const byKey = new Map<string, PulseDiscoveredEnvironmentVariable>();
  for (const variable of variables) {
    const key = `${variable.sourcePath}:${variable.name}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, variable);
      continue;
    }
    byKey.set(key, {
      ...current,
      contexts: [...new Set([...current.contexts, ...variable.contexts])].sort(),
      required: current.required || variable.required,
      secretLike: current.secretLike || variable.secretLike,
    });
  }
  return [...byKey.values()].sort((left, right) => {
    const bySource = left.sourcePath.localeCompare(right.sourcePath);
    return bySource === 0 ? left.name.localeCompare(right.name) : bySource;
  });
}

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
