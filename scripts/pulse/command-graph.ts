import * as path from 'node:path';
import { pathExists, readDir, readTextFile, statPath } from './safe-fs';
import { safeJoin } from './lib/safe-path';
import {
  deriveUnitValue,
  discoverDirectorySkipHintsFromEvidence,
  hasObservedToken,
} from './dynamic-reality-kernel';

export type PulseCommandPurpose =
  | 'install'
  | 'build'
  | 'test'
  | 'dev'
  | 'pulse'
  | 'typecheck'
  | 'lint'
  | 'deploy'
  | 'other';

export type PulseCommandSourceKind =
  | 'package-json'
  | 'lockfile'
  | 'tsconfig'
  | 'dockerfile'
  | 'github-workflow';

export interface PulseDiscoveredCommand {
  id: string;
  purpose: PulseCommandPurpose;
  command: string;
  sourcePath: string;
  sourceKind: PulseCommandSourceKind;
  packagePath?: string;
  scriptName?: string;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

export interface PulseDiscoveredEnvironmentVariable {
  name: string;
  sourcePath: string;
  sourceKind: PulseCommandSourceKind;
  contexts: string[];
  required: boolean;
  secretLike: boolean;
}

export interface PulseCommandGraph {
  generatedAt: string;
  commands: PulseDiscoveredCommand[];
  environmentVariables: PulseDiscoveredEnvironmentVariable[];
  scannedSources: string[];
}

interface PackageJson {
  scripts?: Record<string, unknown>;
}

interface CandidateSource {
  relativePath: string;
  sourceKind: PulseCommandSourceKind;
}

const IGNORED_DIRS = discoverDirectorySkipHintsFromEvidence();
IGNORED_DIRS.add('.git');

const PACKAGE_DIR_ALLOWLIST = new Set([
  '.',
  'backend',
  'frontend',
  'frontend-admin',
  'worker',
  'e2e',
]);

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function toRelativePath(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return normalizeRepoPath(relative || '.');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readTextFile(filePath, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function packagePrefix(packageDir: string): string {
  return packageDir === '.' ? 'npm' : `npm --prefix ${packageDir}`;
}

function classifyCommand(
  scriptName: string | null,
  command: string,
): {
  purpose: PulseCommandPurpose;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
} {
  const loweredName = (scriptName ?? '').toLowerCase();
  const loweredCommand = command.toLowerCase();
  const signals: string[] = [];

  if (loweredName.includes('pulse') || /scripts\/pulse\/run[.]js/.test(loweredCommand)) {
    signals.push('pulse');
    return { purpose: 'pulse', confidence: 'high', signals };
  }
  if (
    loweredName === 'build' ||
    loweredName.endsWith(':build') ||
    /\bnpm run build\b/.test(loweredCommand)
  ) {
    signals.push('build');
    return { purpose: 'build', confidence: 'high', signals };
  }
  if (
    loweredName === 'test' ||
    loweredName.includes(':test') ||
    /\b(vitest|jest|playwright test)\b/.test(loweredCommand)
  ) {
    signals.push('test');
    return { purpose: 'test', confidence: 'high', signals };
  }
  if (
    loweredName === 'dev' ||
    loweredName.includes(':dev') ||
    /\b(next dev|nest start --watch)\b/.test(loweredCommand)
  ) {
    signals.push('dev');
    return { purpose: 'dev', confidence: 'high', signals };
  }
  if (loweredName.includes('typecheck') || /\btsc\b/.test(loweredCommand)) {
    signals.push('typecheck');
    return { purpose: 'typecheck', confidence: 'high', signals };
  }
  if (loweredName.includes('lint') || /\beslint\b/.test(loweredCommand)) {
    signals.push('lint');
    return { purpose: 'lint', confidence: 'high', signals };
  }
  if (/\bnpm ci\b|\bnpm install\b/.test(loweredCommand)) {
    signals.push('install');
    return { purpose: 'install', confidence: 'medium', signals };
  }
  if (/\bdeploy\b|railway|vercel/.test(loweredCommand)) {
    signals.push('deploy');
    return { purpose: 'deploy', confidence: 'medium', signals };
  }
  return { purpose: 'other', confidence: 'low', signals };
}

const MAX_TRAVERSAL_DEPTH = deriveUnitValue() + deriveUnitValue() + deriveUnitValue();

function discoverPackageJsonFiles(rootDir: string): string[] {
  const found: string[] = [];
  const visit = (relativeDir: string, depth: number): void => {
    if (depth > MAX_TRAVERSAL_DEPTH) {
      return;
    }
    const absoluteDir = safeJoin(rootDir, relativeDir);
    for (const entry of readDir(absoluteDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(normalizeRepoPath(path.join(relativeDir, entry.name)), depth + 1);
        }
        continue;
      }
      if (entry.name !== 'package.json') {
        continue;
      }
      const packageDir = normalizeRepoPath(relativeDir || '.');
      if (PACKAGE_DIR_ALLOWLIST.has(packageDir)) {
        found.push(normalizeRepoPath(path.join(relativeDir, entry.name)));
      }
    }
  };
  visit('.', 0);
  return uniqueSorted(found);
}

function discoverStaticSources(rootDir: string): CandidateSource[] {
  const packageJsonFiles = discoverPackageJsonFiles(rootDir).map((relativePath) => ({
    relativePath,
    sourceKind: 'package-json' as const,
  }));
  const sources: CandidateSource[] = [...packageJsonFiles];
  const visit = (relativeDir: string, depth: number): void => {
    if (depth > MAX_TRAVERSAL_DEPTH) {
      return;
    }
    const absoluteDir = safeJoin(rootDir, relativeDir);
    for (const entry of readDir(absoluteDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(normalizeRepoPath(path.join(relativeDir, entry.name)), depth + 1);
        }
        continue;
      }
      const relativePath = normalizeRepoPath(path.join(relativeDir, entry.name));
      if (/^\.github\/workflows\/.+[.]ya?ml$/.test(relativePath)) {
        sources.push({ relativePath, sourceKind: 'github-workflow' });
      } else if (/Dockerfile/.test(entry.name)) {
        sources.push({ relativePath, sourceKind: 'dockerfile' });
      } else if (/tsconfig(?:[.][\w-]+)?[.]json$/.test(entry.name)) {
        sources.push({ relativePath, sourceKind: 'tsconfig' });
      }
    }
  };
  visit('.', 0);
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function inferInstallCommands(
  rootDir: string,
  packageJsonFiles: string[],
): PulseDiscoveredCommand[] {
  return packageJsonFiles.flatMap((relativePackagePath) => {
    const packageDir = normalizeRepoPath(path.dirname(relativePackagePath));
    const lockPath = normalizeRepoPath(path.join(packageDir, 'package-lock.json'));
    const absoluteLockPath = safeJoin(rootDir, lockPath);
    if (!pathExists(absoluteLockPath)) {
      return [];
    }
    const command = `${packagePrefix(packageDir)} ci`;
    return [
      {
        id: `install:${packageDir}`,
        purpose: 'install' as const,
        command,
        sourcePath: lockPath,
        sourceKind: 'lockfile' as const,
        packagePath: relativePackagePath,
        confidence: 'high' as const,
        signals: ['package-lock'],
      },
    ];
  });
}

function inferScriptCommands(
  rootDir: string,
  packageJsonFiles: string[],
): PulseDiscoveredCommand[] {
  const commands: PulseDiscoveredCommand[] = [];
  for (const relativePackagePath of packageJsonFiles) {
    const absolutePackagePath = safeJoin(rootDir, relativePackagePath);
    const parsed = readJsonRecord(absolutePackagePath) as PackageJson | null;
    if (!parsed?.scripts || typeof parsed.scripts !== 'object') {
      continue;
    }
    const packageDir = normalizeRepoPath(path.dirname(relativePackagePath));
    for (const [scriptName, scriptCommand] of Object.entries(parsed.scripts)) {
      if (typeof scriptCommand !== 'string') {
        continue;
      }
      const classification = classifyCommand(scriptName, scriptCommand);
      const command = `${packagePrefix(packageDir)} run ${scriptName}`;
      commands.push({
        id: `script:${packageDir}:${scriptName}`,
        purpose: classification.purpose,
        command,
        sourcePath: relativePackagePath,
        sourceKind: 'package-json',
        packagePath: relativePackagePath,
        scriptName,
        confidence: classification.confidence,
        signals: classification.signals,
      });
    }
  }
  return commands;
}

function inferTsconfigCommands(
  rootDir: string,
  sources: CandidateSource[],
): PulseDiscoveredCommand[] {
  return sources
    .filter((source) => source.sourceKind === 'tsconfig')
    .flatMap((source) => {
      const parsed = readJsonRecord(safeJoin(rootDir, source.relativePath));
      if (!parsed) {
        return [];
      }
      const packageDir = normalizeRepoPath(path.dirname(source.relativePath));
      const packagePath = normalizeRepoPath(path.join(packageDir, 'package.json'));
      if (!pathExists(safeJoin(rootDir, packagePath))) {
        return [];
      }
      return [
        {
          id: `tsconfig:${source.relativePath}`,
          purpose: 'typecheck' as const,
          command: `${packagePrefix(packageDir)} exec tsc --noEmit -p ${path.basename(source.relativePath)}`,
          sourcePath: source.relativePath,
          sourceKind: 'tsconfig' as const,
          packagePath,
          confidence: 'medium' as const,
          signals: ['tsconfig'],
        },
      ];
    });
}

function dockerCommands(sourcePath: string, text: string): PulseDiscoveredCommand[] {
  const commands: PulseDiscoveredCommand[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const runMatch = /^RUN\s+(.+)$/i.exec(trimmed);
    const cmdMatch = /^CMD\s+(.+)$/i.exec(trimmed);
    const commandText = runMatch?.[1] ?? cmdMatch?.[1];
    if (!commandText) {
      return;
    }
    const classification = classifyCommand(null, commandText);
    if (classification.purpose === 'other' && !/\bnpm\b|\bnpx\b/.test(commandText)) {
      return;
    }
    commands.push({
      id: `docker:${sourcePath}:${index + 1}`,
      purpose: classification.purpose,
      command: commandText,
      sourcePath,
      sourceKind: 'dockerfile',
      confidence: classification.confidence,
      signals: ['dockerfile', ...classification.signals],
    });
  });
  return commands;
}

function workflowRunBlocks(text: string): string[] {
  const commands: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const inlineMatch = /^(\s*)run:\s*(.+)$/.exec(line);
    if (inlineMatch?.[2] && !['|', '>'].includes(inlineMatch[2].trim())) {
      commands.push(inlineMatch[2].trim());
      continue;
    }
    const blockMatch = /^(\s*)run:\s*[|>]?\s*$/.exec(line);
    if (!blockMatch) {
      continue;
    }
    const baseIndent = blockMatch[1].length;
    const blockLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? '';
      if (candidate.trim() && candidate.search(/\S/) <= baseIndent) {
        break;
      }
      if (candidate.trim()) {
        blockLines.push(candidate.trim());
      }
      index = cursor;
    }
    if (blockLines.length > 0) {
      commands.push(blockLines.join(' && '));
    }
  }
  return commands;
}

function workflowCommands(sourcePath: string, text: string): PulseDiscoveredCommand[] {
  return workflowRunBlocks(text).map((command, index) => {
    const classification = classifyCommand(null, command);
    return {
      id: `workflow:${sourcePath}:${index + 1}`,
      purpose: classification.purpose,
      command,
      sourcePath,
      sourceKind: 'github-workflow' as const,
      confidence: classification.confidence,
      signals: ['github-workflow', ...classification.signals],
    };
  });
}

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
  return (
    hasObservedToken(tokens, ['secret']) ||
    hasObservedToken(tokens, ['token']) ||
    hasObservedToken(tokens, ['password']) ||
    hasObservedToken(tokens, ['private']) ||
    (hasObservedToken(tokens, ['api']) && hasObservedToken(tokens, ['key'])) ||
    (hasObservedToken(tokens, ['access']) && hasObservedToken(tokens, ['key'])) ||
    hasObservedToken(tokens, ['webhook'])
  );
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
    const upperTrimmed = trimmed.toUpperCase();
    if (upperTrimmed.startsWith('ARG ')) {
      const declaration = trimmed.slice(4).trim();
      const [name, defaultValue] = declaration.split('=', 2);
      if (isLikelyEnvName(name)) {
        add(name, defaultValue === undefined ? 'docker-arg-required' : 'docker-arg-default');
      }
    }
    if (upperTrimmed.startsWith('ENV ')) {
      for (const name of collectUppercaseNames(trimmed.slice(4))) {
        add(name, 'docker-env');
      }
    }
    if (!trimmed.startsWith('- ') && trimmed.includes(':')) {
      const [candidate] = trimmed.split(':', 1);
      if (isLikelyEnvName(candidate.trim())) {
        add(candidate.trim(), 'workflow-env');
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
