import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeLeasePath(rootDir: string, filePath: string): string | null {
  const trimmed = filePath.trim().replace(/\s+\(\d+\)$/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;
  const slashNormalized = normalizeRepoPath(trimmed);
  const relativePath = path.isAbsolute(slashNormalized)
    ? path.relative(rootDir, slashNormalized)
    : slashNormalized;
  const normalized = normalizeRepoPath(relativePath);
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.isAbsolute(normalized) ||
    normalized.split('/').includes('..') ||
    /\s+\(\d+\)$/.test(normalized)
  )
    return null;
  return normalized;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}

function uniqueLeasePaths(rootDir: string, values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => normalizeLeasePath(rootDir, value)).filter(Boolean) as string[],
    ),
  ].sort();
}

function currentCommit(rootDir: string): string | null {
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

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fileMtimeIso(filePath: string): string | null {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  if (!pathExists(filePath)) return null;
  try {
    const parsed = JSON.parse(readTextFile(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildContextDigest(input: {
  runId: string;
  gitnexusRef: string;
  beadsRef: string;
  directiveRef: string;
  certificateRef: string;
  unitIds: string[];
  protectedFiles: string[];
}): string {
  return sha256(input);
}

function loadPreviousContextDigest(rootDir: string): string | null {
  const previousPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_CONTEXT_BROADCAST.json');
  const previous = readJsonRecord(previousPath);
  return typeof previous?.contextDigest === 'string' ? previous.contextDigest : null;
}

export {
  normalizeRepoPath,
  normalizeLeasePath,
  uniqueStrings,
  uniqueLeasePaths,
  currentCommit,
  sha256,
  fileMtimeIso,
  readJsonRecord,
  buildContextDigest,
  loadPreviousContextDigest,
};
