/**
 * Shared structural-observation helpers for operator-scenario evidence.
 *
 * These helpers verify, by static path inspection only, that the routes /
 * controllers / processors a scenario depends on are actually present in the
 * codebase. They never make HTTP requests and never spawn external processes.
 *
 * The contract is intentionally narrow: each check returns a boolean, and the
 * higher-level scenario module aggregates booleans into a `truthMode: 'observed'`
 * scenario evidence record.
 */
import { safeJoin } from '../../safe-path';
import { pathExists } from '../../safe-fs';

export interface StructuralCheck {
  label: string;
  path: string;
  present: boolean;
}

export function checkPaths(
  rootDir: string,
  paths: ReadonlyArray<{ label: string; relPath: string }>,
): StructuralCheck[] {
  return paths.map((entry) => {
    const absolute = safeJoin(rootDir, entry.relPath);
    return {
      label: entry.label,
      path: entry.relPath,
      present: pathExists(absolute),
    };
  });
}

export function allPresent(checks: StructuralCheck[]): boolean {
  return checks.every((check) => check.present);
}

export function summarizeMissing(checks: StructuralCheck[]): string {
  return checks
    .filter((check) => !check.present)
    .map((check) => `${check.label} (${check.path})`)
    .join('; ');
}
