import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAllowedRootForAbsolutePath, REPO_ROOT } from './guard.js';

export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** Optimistic-concurrency guard: refuse if the file changed since the agent
 * read it (defends against the concurrent-agent collisions this repo is known
 * for). Opt-in via expectedSha256. Never leaks file content. */
export function guardSha(before: string, expected: string | undefined): void {
  if (expected && sha256(before) !== expected) {
    throw new Error(
      `sha256 mismatch: file changed since you read it (expected ${expected.slice(0, 12)}…, ` +
        `got ${sha256(before).slice(0, 12)}…). Re-read and retry — NOT written.`,
    );
  }
}

export const log = (...a: unknown[]): void => {
  process.stderr.write(`[atomic-edit] ${a.map(String).join(' ')}\n`);
};

/** Atomic durable write: temp file in same dir, fsync, rename. */
export function atomicWrite(absPath: string, content: string): void {
  const dir = path.dirname(absPath);
  const tmp = path.join(dir, `.atomic-edit.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, absPath);
}

export function readUtf8(absPath: string): string {
  if (!fs.existsSync(absPath)) throw new Error(`file does not exist: ${absPath}`);
  const st = fs.statSync(absPath);
  if (!st.isFile()) throw new Error(`not a regular file: ${absPath}`);
  return fs.readFileSync(absPath, 'utf8');
}

export function normalizeRepoRelPath(value: string): string {
  const normalized = value.replaceAll(path.sep, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized;
}

export function normalizeAllowedPath(value: string, repoRoot: string): string {
  if (!path.isAbsolute(value)) {
    return normalizeRepoRelPath(value);
  }
  const rel = path.relative(repoRoot, path.resolve(value));
  if (rel === '') {
    return '';
  }
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return normalizeRepoRelPath(value);
  }
  return normalizeRepoRelPath(rel);
}

export function relPathAllowed(relPath: string, allowedPaths: string[]): boolean {
  const rel = normalizeRepoRelPath(relPath);
  return allowedPaths.some((allowed) => {
    const normalized = normalizeRepoRelPath(allowed);
    return normalized === '' || rel === normalized || rel.startsWith(`${normalized}/`);
  });
}

export function changedSpanMetrics(
  before: string,
  after: string,
): {
  changedChars: number;
  lineSurfaceChars: number;
  expansionFactor: number;
  oldSample: string;
  newSample: string;
  preservedPrefixHash: string;
  preservedSuffixHash: string;
} {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > prefix && afterEnd > prefix && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }
  const oldChanged = before.slice(prefix, beforeEnd);
  const newChanged = after.slice(prefix, afterEnd);
  const changedChars = Math.max(oldChanged.length, newChanged.length);
  const lineStartCandidate = before.lastIndexOf('\n', Math.max(prefix - 1, 0));
  const lineStart = lineStartCandidate === -1 ? 0 : lineStartCandidate + 1;
  const lineEndCandidate = before.indexOf('\n', beforeEnd);
  const lineEnd = lineEndCandidate === -1 ? before.length : lineEndCandidate;
  const lineSurfaceChars = changedChars === 0 ? 0 : Math.max(lineEnd - lineStart, changedChars);
  const sample = (text: string): string => (text.length <= 240 ? text : `${text.slice(0, 237)}...`);
  return {
    changedChars,
    lineSurfaceChars,
    expansionFactor: Number((lineSurfaceChars / Math.max(changedChars, 1)).toFixed(2)),
    oldSample: sample(oldChanged),
    newSample: sample(newChanged),
    preservedPrefixHash: sha256(before.slice(0, prefix)),
    preservedSuffixHash: sha256(before.slice(beforeEnd)),
  };
}

export interface EslintDryRunResult {
  filePath: string;
  output?: string;
  messages?: { ruleId?: string | null; message?: string; line?: number; column?: number }[];
  errorCount?: number;
  warningCount?: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
}

export function hasArg(args: string[], bare: string): boolean {
  return args.some(
    (arg, index) => arg === bare || arg.startsWith(`${bare}=`) || args[index - 1] === bare,
  );
}

export function normalizeEslintDryRunArgs(args: string[]): string[] {
  if (args[0] === 'npx' && args[1] === 'eslint') return args.slice(2);
  if (args[0] === 'eslint') return args.slice(1);
  return args;
}

export function requireEslintDryRunArgs(args: string[]): void {
  if (args.includes('--fix')) throw new Error('refused: use --fix-dry-run, not --fix');
  if (!args.includes('--fix-dry-run'))
    throw new Error('refused: eslint args must include --fix-dry-run');
  const formatJson =
    args.includes('--format=json') ||
    args.includes('-f=json') ||
    args.some((arg, index) => (arg === '--format' || arg === '-f') && args[index + 1] === 'json');
  if (!formatJson) throw new Error('refused: eslint args must include --format json');
  if (hasArg(args, '--output-file') || hasArg(args, '-o')) {
    throw new Error('refused: analyzer output must stay on stdout, not --output-file');
  }
}

export function parseEslintJson(stdout: string): EslintDryRunResult[] {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('[')) throw new Error('eslint did not emit JSON array on stdout');
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) throw new Error('eslint JSON output was not an array');
  return parsed as EslintDryRunResult[];
}

export function targetDetails(absPath: string, relPath: string): Record<string, unknown> {
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
  return {
    target: {
      repoRoot,
      file: relPath,
      absPath,
    },
  };
}

export function shellPath(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : JSON.stringify(value);
}

export function nearestPackageRelPath(repoRoot: string, relPath: string): string | null {
  const normalized = normalizeRepoRelPath(relPath);
  const parts = normalized === '.' ? [] : normalized.split('/').filter(Boolean);
  for (let depth = parts.length; depth >= 0; depth--) {
    const packageRelPath = parts.slice(0, depth).join('/') || '.';
    const packageJsonPath = path.join(
      repoRoot,
      packageRelPath === '.' ? '' : packageRelPath,
      'package.json',
    );
    if (fs.existsSync(packageJsonPath)) return packageRelPath;
  }
  return null;
}

