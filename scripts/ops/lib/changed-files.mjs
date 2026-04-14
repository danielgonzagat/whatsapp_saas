import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..', '..');

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return '';
    }
    throw error;
  }
}

function refExists(ref) {
  return (
    spawnSync('git', ['rev-parse', '--verify', ref], {
      cwd: repoRoot,
      stdio: 'ignore',
    }).status === 0
  );
}

function resolveBaseRef() {
  const envBaseRef = process.env.GITHUB_BASE_REF?.trim();
  const candidates = [];

  if (envBaseRef) {
    candidates.push(`origin/${envBaseRef}`, envBaseRef);
  }

  candidates.push('origin/main', 'main');

  for (const candidate of candidates) {
    if (candidate && refExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveDiffRange() {
  const baseRef = resolveBaseRef();

  if (baseRef) {
    const mergeBase = runGit(['merge-base', 'HEAD', baseRef], { allowFailure: true });
    if (mergeBase) {
      return `${mergeBase}...HEAD`;
    }
    return `${baseRef}...HEAD`;
  }

  const previousHead = runGit(['rev-parse', 'HEAD~1'], { allowFailure: true });
  return previousHead ? `${previousHead}...HEAD` : 'HEAD';
}

function splitLines(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function collectChangedFiles() {
  const diffRange = resolveDiffRange();
  const fromRange = splitLines(runGit(['diff', '--name-only', diffRange], { allowFailure: true }));
  if (fromRange.length > 0) {
    return fromRange;
  }

  const staged = splitLines(runGit(['diff', '--name-only', '--cached'], { allowFailure: true }));
  if (staged.length > 0) {
    return staged;
  }

  return splitLines(
    runGit(['status', '--short'], { allowFailure: true })
      .split('\n')
      .map((line) => line.slice(3))
      .join('\n'),
  );
}

export function collectNameStatus() {
  const diffRange = resolveDiffRange();
  const output =
    runGit(['diff', '--name-status', '-M', diffRange], { allowFailure: true }) ||
    runGit(['diff', '--name-status', '-M', '--cached'], { allowFailure: true });

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split('\t');
      return {
        status,
        paths,
      };
    });
}

export function relativizeToWorkspace(workspacePrefix, files) {
  return files
    .filter((file) => file.startsWith(`${workspacePrefix}/`))
    .map((file) => file.slice(workspacePrefix.length + 1));
}
