import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export interface RollbackOutcome {
  attempted: boolean;
  revertedFiles: string[];
  removedUntracked: string[];
  summary: string;
  skipped: boolean;
}

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
  if (tracked.status === 0) {
    for (const line of (tracked.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  if (untracked.status === 0) {
    for (const line of (untracked.stdout || '').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return Array.from(out);
}

export function rollbackRegression(
  rootDir: string,
  unitFileScope: string[] | null | undefined,
  reason: string,
): RollbackOutcome {
  const scope = (unitFileScope || []).filter(
    (entry) => typeof entry === 'string' && entry.length > 0,
  );

  if (scope.length === 0) {
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
  if (gitCheck.status !== 0) {
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
    const lsTree = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', relativePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const trackedAtHead = lsTree.status === 0 && (lsTree.stdout || '').trim().length > 0;

    if (trackedAtHead) {
      const checkout = spawnSync('git', ['checkout', 'HEAD', '--', relativePath], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (checkout.status === 0) {
        revertedFiles.push(relativePath);
      }
    } else if (fs.existsSync(absolutePath)) {
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
    revertedFiles.length === 0 && removedUntracked.length === 0
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
