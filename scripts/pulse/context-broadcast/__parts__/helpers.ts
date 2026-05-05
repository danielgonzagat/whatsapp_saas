import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { deriveZeroValue, discoverRouteSeparatorFromRuntime } from '../../dynamic-reality-kernel';
import type { ProtectedGovernanceConfig } from './types';

export function normalizeRepoPath(filePath: string): string {
  const sep = discoverRouteSeparatorFromRuntime();
  return filePath.replace(/\\/g, sep).replace(/^\.\//, '');
}

export function normalizeLeasePath(rootDir: string, filePath: string): string | null {
  const trimmed = filePath.trim().replace(/\s+\(\d+\)$/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return null;
  }
  const slashNormalized = normalizeRepoPath(trimmed);
  const relativePath = path.isAbsolute(slashNormalized)
    ? path.relative(rootDir, slashNormalized)
    : slashNormalized;
  const normalized = normalizeRepoPath(relativePath);
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('..' + discoverRouteSeparatorFromRuntime()) ||
    path.isAbsolute(normalized) ||
    normalized.split(discoverRouteSeparatorFromRuntime()).includes('..') ||
    /\s+\(\d+\)$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}

export function uniqueLeasePaths(rootDir: string, values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => normalizeLeasePath(rootDir, value)).filter(Boolean) as string[],
    ),
  ].sort();
}

export function readProtectedGovernanceConfig(rootDir: string): ProtectedGovernanceConfig {
  const fallback: ProtectedGovernanceConfig = {
    protectedExact: ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'package.json', '.codacy.yml'],
    protectedPrefixes: [
      'ops/',
      'scripts/ops/',
      '.github/workflows/',
      'docs/codacy/',
      'docs/design/',
    ],
  };
  const configPath = safeJoin(rootDir, 'ops', 'protected-governance-files.json');
  if (!pathExists(configPath)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(
      readTextFile(configPath, 'utf8'),
    ) as Partial<ProtectedGovernanceConfig>;
    return {
      protectedExact: Array.isArray(parsed.protectedExact)
        ? parsed.protectedExact.map(String)
        : fallback.protectedExact,
      protectedPrefixes: Array.isArray(parsed.protectedPrefixes)
        ? parsed.protectedPrefixes.map(String)
        : fallback.protectedPrefixes,
    };
  } catch {
    return fallback;
  }
}

export function isProtectedFile(filePath: string, config: ProtectedGovernanceConfig): boolean {
  const normalized = normalizeRepoPath(filePath);
  return (
    config.protectedExact.includes(normalized) ||
    config.protectedPrefixes.some((prefix) => normalized.startsWith(normalizeRepoPath(prefix)))
  );
}

export function protectedForbiddenFiles(config: ProtectedGovernanceConfig): string[] {
  return uniqueStrings([...config.protectedExact, ...config.protectedPrefixes]);
}

export function currentCommit(rootDir: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3_000,
    }).trim();
  } catch {
    return null;
  }
}

export function readJsonRecord(filePath: string): Record<string, unknown> | null {
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readTextFile(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function fileMtimeIso(filePath: string): string | null {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}
