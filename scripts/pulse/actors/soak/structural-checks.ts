/**
 * Shared structural-observation helpers for soak-scenario evidence.
 *
 * Soak scenarios cannot be executed live in scan mode, so they are observed
 * by static inspection of the runtime artifacts they depend on:
 * queues/workers/DLQ/idempotency keys, reconciliation cron jobs, and
 * append-only ledger structures. Each helper returns booleans; the
 * higher-level scenario module aggregates them into a `truthMode: 'observed'`
 * evidence record.
 */
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';

export interface StructuralCheck {
  /** Human-readable label for the check. */
  label: string;
  /** Repo-relative path that was inspected. */
  path: string;
  /** True when the artifact is present (and matches expected tokens). */
  present: boolean;
}

/** Verify a list of file paths exist. */
export function checkPaths(
  rootDir: string,
  paths: ReadonlyArray<{ label: string; relPath: string }>,
): StructuralCheck[] {
  return paths.map((entry) => {
    const absolute = safeJoin(rootDir, entry.relPath);
    return { label: entry.label, path: entry.relPath, present: pathExists(absolute) };
  });
}

/**
 * Verify that a file exists AND every regex in `patterns` matches its
 * contents. Used to confirm runtime guarantees (e.g. backoff/attempts in the
 * queue layer, @Cron in reconciliation services, append-only doc on schema).
 */
export function checkFileMatches(
  rootDir: string,
  spec: { label: string; relPath: string; patterns: RegExp[] },
): StructuralCheck {
  const absolute = safeJoin(rootDir, spec.relPath);
  if (!pathExists(absolute)) {
    return { label: spec.label, path: spec.relPath, present: false };
  }
  let content = '';
  try {
    content = readTextFile(absolute);
  } catch {
    return { label: spec.label, path: spec.relPath, present: false };
  }
  const present = spec.patterns.every((pattern) => pattern.test(content));
  return { label: spec.label, path: spec.relPath, present };
}

/** True when every check in the array is present. */
export function allPresent(checks: StructuralCheck[]): boolean {
  return checks.every((check) => check.present);
}

/** Compose a one-line summary of missing checks. */
export function summarizeMissing(checks: StructuralCheck[]): string {
  return checks
    .filter((check) => !check.present)
    .map((check) => `${check.label} (${check.path})`)
    .join('; ');
}
