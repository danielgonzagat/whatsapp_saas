import * as path from 'node:path';
import { pathExists, readDir, readTextFile, statPath } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import { deriveUnitValue } from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  discoverDirectorySkipHintsFromEvidence,
  splitIdentifierTokensFromObservedName,
  hasObservedToken,
} from '../../dynamic-reality-kernel/__parts__/token-evidence';
import type {
  PulseCommandPurpose,
  PulseDiscoveredCommand,
  PackageJson,
  CandidateSource,
  PulseConfidence,
  PulseCommandSourceKind,
} from './types';
import { discoverSourceFilePatternCatalog, discoverPackageLockTokenCatalog } from './types';

const IGNORED_DIRS = discoverDirectorySkipHintsFromEvidence();
IGNORED_DIRS.add('.git');

const PULSE_PURPOSE_PATTERNS = discoverPurposeEvidencePatterns();
const PULSE_SOURCE_FILE_PATTERNS = discoverSourceFilePatternCatalog();
const PULSE_PACKAGE_LOCK_TOKENS = discoverPackageLockTokenCatalog();

function discoverPurposeEvidencePatterns() {
  return [
    {
      purpose: 'pulse' as const,
      confidence: 'high' as const,
      nameTokens: ['pulse'],
      commandTokens: ['scripts', 'pulse', 'run'],
      commandRegex: /scripts\/pulse\/run[.]js/,
    },
    {
      purpose: 'build' as const,
      confidence: 'high' as const,
      nameTokens: ['build'],
      commandTokens: ['build'],
      commandRegex: /\bnpm\s+run\s+build\b/,
    },
    {
      purpose: 'test' as const,
      confidence: 'high' as const,
      nameTokens: ['test'],
      commandTokens: ['vitest', 'jest', 'playwright', 'test'],
      commandRegex: /\b(?:vitest|jest|playwright\s+test)\b/,
    },
    {
      purpose: 'dev' as const,
      confidence: 'high' as const,
      nameTokens: ['dev'],
      commandTokens: ['next', 'dev', 'nest', 'start'],
      commandRegex: /\b(?:next\s+dev|nest\s+start\s+--watch)\b/,
    },
    {
      purpose: 'typecheck' as const,
      confidence: 'high' as const,
      nameTokens: ['typecheck'],
      commandTokens: ['tsc', 'typecheck'],
      commandRegex: /\btsc\b/,
    },
    {
      purpose: 'lint' as const,
      confidence: 'high' as const,
      nameTokens: ['lint'],
      commandTokens: ['eslint', 'lint'],
      commandRegex: /\beslint\b/,
    },
    {
      purpose: 'install' as const,
      confidence: 'medium' as const,
      nameTokens: ['install', 'ci'],
      commandTokens: ['npm', 'ci', 'install'],
      commandRegex: /\bnpm\s+(?:ci|install)\b/,
    },
    {
      purpose: 'deploy' as const,
      confidence: 'medium' as const,
      nameTokens: ['deploy'],
      commandTokens: ['deploy', 'railway', 'vercel'],
      commandRegex: /\b(?:deploy|railway|vercel)\b/,
    },
  ];
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function toRelativePath(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return normalizeRepoPath(relative || '.');
}

export function uniqueSorted(values: string[]): string[] {
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
  confidence: PulseConfidence;
  signals: string[];
} {
  const scriptTokens = splitIdentifierTokensFromObservedName(scriptName ?? '');
  const commandTokens = splitIdentifierTokensFromObservedName(command);
  const mergedTokens = new Set([...scriptTokens, ...commandTokens]);
  const signals: string[] = [];

  for (const pattern of PULSE_PURPOSE_PATTERNS) {
    const nameMatches = hasObservedToken(scriptTokens, pattern.nameTokens);
    const commandRegexMatches = pattern.commandRegex.test(command);
    const commandTokenMatches = hasObservedToken(mergedTokens, pattern.commandTokens);
    const primarySignal = pattern.nameTokens[0];

    if (nameMatches || commandRegexMatches || commandTokenMatches) {
      signals.push(primarySignal);
      const confidence: PulseConfidence =
        nameMatches && commandRegexMatches ? pattern.confidence : 'medium';
      return { purpose: pattern.purpose, confidence, signals };
    }
  }

  signals.push('other');
  return { purpose: 'other' as PulseCommandPurpose, confidence: 'low' as PulseConfidence, signals };
}

const MAX_TRAVERSAL_DEPTH = deriveUnitValue() + deriveUnitValue() + deriveUnitValue();

export function discoverPackageJsonFiles(rootDir: string): string[] {
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
      found.push(normalizeRepoPath(path.join(relativeDir, entry.name)));
    }
  };
  visit('.', 0);
  return uniqueSorted(found);
}

function classifySourceFile(
  relativePath: string,
  entryName: string,
): PulseCommandSourceKind | null {
  for (const { sourceKind, pattern: patternStr } of PULSE_SOURCE_FILE_PATTERNS) {
    const regex = new RegExp(patternStr);
    if (regex.test(relativePath) || regex.test(entryName)) {
      return sourceKind;
    }
  }
  return null;
}

export function discoverStaticSources(rootDir: string): CandidateSource[] {
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
      const sourceKind = classifySourceFile(relativePath, entry.name);
      if (sourceKind) {
        sources.push({ relativePath, sourceKind });
      }
    }
  };
  visit('.', 0);
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function inferInstallCommands(
  rootDir: string,
  packageJsonFiles: string[],
): PulseDiscoveredCommand[] {
  return packageJsonFiles.flatMap((relativePackagePath) => {
    const packageDir = normalizeRepoPath(path.dirname(relativePackagePath));
    for (const lockName of PULSE_PACKAGE_LOCK_TOKENS) {
      const lockPath = normalizeRepoPath(path.join(packageDir, lockName));
      const absoluteLockPath = safeJoin(rootDir, lockPath);
      if (pathExists(absoluteLockPath)) {
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
      }
    }
    return [];
  });
}

export function inferScriptCommands(
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

export function inferTsconfigCommands(
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

export function dockerCommands(sourcePath: string, text: string): PulseDiscoveredCommand[] {
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

export function workflowRunBlocks(text: string): string[] {
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

export function workflowCommands(sourcePath: string, text: string): PulseDiscoveredCommand[] {
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
