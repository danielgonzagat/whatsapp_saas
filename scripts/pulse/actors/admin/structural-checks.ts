/**
 * Shared structural-observation helpers for admin-scenario evidence.
 *
 * Mirrors `actors/operator/structural-checks.ts`: verifies, by static path
 * inspection only, that the routes / controllers / services / worker handlers
 * an admin scenario depends on are actually present in the codebase. Never
 * makes HTTP requests and never spawns external processes.
 */
import { safeJoin } from '../../safe-path';
import { pathExists, readTextFile } from '../../safe-fs';

export interface AdminStructuralCheck {
  label: string;
  path: string;
  present: boolean;
}

export interface AdminStructuralCheckSpec {
  label: string;
  relPath: string;
  /**
   * Optional content fragments that must all appear in the file. If the path
   * does not exist, `present` is false regardless of `mustContain`.
   */
  mustContain?: string[];
}

export function checkAdminPaths(
  rootDir: string,
  paths: ReadonlyArray<AdminStructuralCheckSpec>,
): AdminStructuralCheck[] {
  return paths.map((entry) => {
    const absolute = safeJoin(rootDir, entry.relPath);
    if (!pathExists(absolute)) {
      return { label: entry.label, path: entry.relPath, present: false };
    }
    if (!entry.mustContain || entry.mustContain.length === 0) {
      return { label: entry.label, path: entry.relPath, present: true };
    }
    let present = true;
    try {
      const text = readTextFile(absolute);
      present = entry.mustContain.every((needle) => text.includes(needle));
    } catch {
      present = false;
    }
    return { label: entry.label, path: entry.relPath, present };
  });
}

export function allAdminPresent(checks: AdminStructuralCheck[]): boolean {
  return checks.every((check) => check.present);
}

export function summarizeAdminMissing(checks: AdminStructuralCheck[]): string {
  return checks
    .filter((check) => !check.present)
    .map((check) => `${check.label} (${check.path})`)
    .join('; ');
}
