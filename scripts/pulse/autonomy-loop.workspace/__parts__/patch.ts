import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildArtifactRegistry } from '../../artifact-registry/__parts__/registry';
import { ensureDir, pathExists, removePath, writeTextFile } from '../../safe-fs';
import { compact, commandExists } from '../../autonomy-loop.utils';
import type { PulseRollbackGuard } from '../../autonomy-loop.types';
import type { PulseWorkerLeaseValidationInput } from './types';
import { normalizeRepoPath, normalizeLeasePath, validateChangedFilesAgainstLease } from './lease';
import { runWorkspaceCommand } from './workspace';

/** Collect workspace patch. */
export function collectWorkspacePatch(
  workspacePath: string,
  patchPath: string,
): {
  patchPath: string | null;
  changedFiles: string[];
  summary: string;
} {
  const diffResult = runWorkspaceCommand(workspacePath, 'git', ['diff', '--binary', 'HEAD', '--']);
  if (diffResult.status !== 0) {
    throw new Error(
      compact(diffResult.stderr || diffResult.stdout || 'Unable to generate worker patch.', 400),
    );
  }

  const changedFilesResult = runWorkspaceCommand(workspacePath, 'git', [
    'diff',
    '--name-only',
    'HEAD',
    '--',
  ]);
  if (changedFilesResult.status !== 0) {
    throw new Error(
      compact(
        changedFilesResult.stderr || changedFilesResult.stdout || 'Unable to list worker changes.',
        400,
      ),
    );
  }

  const changedFiles = changedFilesResult.stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  if (diffResult.stdout.trim().length === 0) {
    return {
      patchPath: null,
      changedFiles,
      summary: 'Worker completed without file changes inside the isolated workspace.',
    };
  }

  writeTextFile(patchPath, diffResult.stdout);
  return {
    patchPath,
    changedFiles,
    summary: `Worker produced ${changedFiles.length} changed file(s) in isolated workspace.`,
  };
}

function readPatchChangedFiles(rootDir: string, patchPath: string): string[] {
  const result = runWorkspaceCommand(rootDir, 'git', ['apply', '--numstat', patchPath]);
  if (result.status !== 0) {
    throw new Error(
      compact(result.stderr || result.stdout || 'Unable to inspect worker patch files.', 300),
    );
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\t').slice(2).join('\t').trim())
    .filter(Boolean)
    .map(normalizeRepoPath);
}

/** Apply worker patch to root. */
export function applyWorkerPatchToRoot(
  rootDir: string,
  patchPath: string,
  workerId: string,
  lease?: PulseWorkerLeaseValidationInput,
  changedFiles?: string[],
): { status: 'applied' | 'failed'; summary: string } {
  if (lease) {
    const files = changedFiles
      ? changedFiles.map((filePath) => normalizeLeasePath(filePath, rootDir) || filePath)
      : readPatchChangedFiles(rootDir, patchPath);
    const leaseViolation = validateChangedFilesAgainstLease(files, lease, rootDir);
    if (leaseViolation) {
      return {
        status: 'failed',
        summary: `Worker ${workerId} patch violates its lease: ${leaseViolation}`,
      };
    }
  }

  const checkResult = runWorkspaceCommand(rootDir, 'git', [
    'apply',
    '--check',
    '--whitespace=nowarn',
    patchPath,
  ]);
  if (checkResult.status !== 0) {
    return {
      status: 'failed',
      summary: `Worker ${workerId} patch could not be applied cleanly to the main workspace: ${compact(checkResult.stderr || checkResult.stdout || 'git apply --check failed.', 300)}`,
    };
  }

  const applyResult = runWorkspaceCommand(rootDir, 'git', [
    'apply',
    '--whitespace=nowarn',
    patchPath,
  ]);
  if (applyResult.status !== 0) {
    return {
      status: 'failed',
      summary: `Worker ${workerId} patch failed during application to the main workspace: ${compact(applyResult.stderr || applyResult.stdout || 'git apply failed.', 300)}`,
    };
  }

  return {
    status: 'applied',
    summary: `Worker ${workerId} patch applied cleanly to the main workspace.`,
  };
}

/** Detect rollback guard status. */
export function detectRollbackGuard(rootDir: string): PulseRollbackGuard {
  if (!commandExists('git', rootDir)) {
    return {
      enabled: false,
      reason: 'git is not available on PATH, so automatic rollback is disabled.',
    };
  }

  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (status.status !== 0) {
    return {
      enabled: false,
      reason: compact(status.stderr || status.stdout || 'Unable to inspect git status.', 300),
    };
  }

  if ((status.stdout || '').trim().length > 0) {
    return {
      enabled: false,
      reason: 'working tree is dirty, so automatic rollback is disabled for this run.',
    };
  }

  return {
    enabled: true,
    reason: null,
  };
}

/** Roll back workspace to HEAD. */
export function rollbackWorkspaceToHead(rootDir: string): string {
  const registry = buildArtifactRegistry(rootDir);
  ensureDir(registry.tempDir, { recursive: true });
  const patchPath = path.join(registry.tempDir, `pulse-rollback-${Date.now()}.patch`);
  const diff = spawnSync('git', ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', '.'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (diff.status !== 0) {
    return compact(diff.stderr || diff.stdout || 'Unable to compute rollback patch.', 300);
  }

  const patch = diff.stdout || '';
  if (patch.trim().length > 0) {
    writeTextFile(patchPath, patch);
    const apply = spawnSync('git', ['apply', '-R', '--whitespace=nowarn', patchPath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (apply.status !== 0) {
      return compact(apply.stderr || apply.stdout || 'Unable to apply rollback patch.', 300);
    }
  }

  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (untracked.status === 0) {
    for (const relativePath of (untracked.stdout || '').split('\n').map((value) => value.trim())) {
      if (!relativePath) {
        continue;
      }
      const absolutePath = path.join(rootDir, relativePath);
      if (pathExists(absolutePath)) {
        removePath(absolutePath, { recursive: true, force: true });
      }
    }
  }

  return 'Automatic rollback restored the workspace to the pre-run HEAD state.';
}
