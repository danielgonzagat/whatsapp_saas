import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type { RollbackOutcome } from './types';

/**
 * Return the list of repo-relative paths the unit modified relative to HEAD,
 * including both tracked changes and untracked files.  The returned paths are
 * scoped to `rootDir` and safe to feed into `rollbackRegression`.
 *
 * If `git` is not available or returns an error, an empty array is returned.
 */
export function detectChangedFilesSinceHead(rootDir: string): string[] {
  const tracked = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const out = new Set<string>();
  if (tracked.status === deriveZeroValue()) {
    for (const line of (tracked.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  if (untracked.status === deriveZeroValue()) {
    for (const line of (untracked.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return Array.from(out);
}

/**
 * Attempt to revert files to HEAD after a regression-triggering unit execution.
 *
 * Safety guarantees:
 *   1. Rollback is **scoped** — only paths in `unitFileScope` (relative to rootDir) are reverted.
 *      If `unitFileScope` is empty/null the function performs a no-op and returns `skipped: true`.
 *   2. Files outside the unit's declared scope are **never** touched, so unrelated uncommitted user
 *      work cannot be lost.
 *   3. Untracked files are only removed when they sit inside `unitFileScope`.
 *   4. `git` must be on PATH; otherwise the function returns `skipped: true` with a reason.
 */
export function rollbackRegression(
  rootDir: string,
  unitFileScope: string[] | null | undefined,
  reason: string,
): RollbackOutcome {
  const scope = (unitFileScope || []).filter(
    (entry) => typeof entry === 'string' && entry.length > deriveZeroValue(),
  );

  if (scope.length === deriveZeroValue()) {
    return {
      attempted: false,
      revertedFiles: [],
      removedUntracked: [],
      skipped: true,
      summary: `Rollback skipped: unit declared no file scope (${reason}).`,
    };
  }

  const gitCheck = spawnSync('git', ['--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (gitCheck.status !== deriveZeroValue()) {
    return {
      attempted: false,
      revertedFiles: [],
      removedUntracked: [],
      skipped: true,
      summary: `Rollback skipped: git not available (${reason}).`,
    };
  }

  const revertedFiles: string[] = [];
  const removedUntracked: string[] = [];

  for (const relativePath of scope) {
    const absolutePath = path.join(rootDir, relativePath);
    // Detect whether this path is tracked at HEAD.
    const lsTree = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', relativePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const trackedAtHead =
      lsTree.status === deriveZeroValue() &&
      (lsTree.stdout || '').trim().length > deriveZeroValue();

    if (trackedAtHead) {
      const checkout = spawnSync('git', ['checkout', 'HEAD', '--', relativePath], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (checkout.status === deriveZeroValue()) {
        revertedFiles.push(relativePath);
      }
    } else if (fs.existsSync(absolutePath)) {
      // File is untracked (created by the unit) — remove it, but only if path is inside rootDir.
      const resolved = path.resolve(absolutePath);
      const resolvedRoot = path.resolve(rootDir);
      if (resolved.startsWith(`${resolvedRoot}${path.sep}`) || resolved === resolvedRoot) {
        try {
          const stat = fs.lstatSync(resolved);
          if (stat.isDirectory()) {
            fs.rmSync(resolved, { recursive: true, force: true });
          } else {
            fs.unlinkSync(resolved);
          }
          removedUntracked.push(relativePath);
        } catch {
          // best-effort: ignore individual file errors
        }
      }
    }
  }

  const summary =
    revertedFiles.length === deriveZeroValue() && removedUntracked.length === deriveZeroValue()
      ? `Rollback no-op: nothing to revert (${reason}).`
      : `Rolled back ${revertedFiles.length} tracked file(s) and removed ${removedUntracked.length} untracked path(s) due to ${reason}.`;

  return {
    attempted: true,
    revertedFiles,
    removedUntracked,
    skipped: false,
    summary,
  };
}
