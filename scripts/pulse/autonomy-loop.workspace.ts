/**
 * Isolated worker workspace management for parallel autonomous execution.
 * Handles creation, patch collection, and patch application.
 */
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildArtifactRegistry } from './artifact-registry';
import { copyPath, ensureDir, pathExists, removePath, symlinkDir, writeTextFile } from './safe-fs';
import type { PulseWorkerWorkspace } from './autonomy-loop.types';
import {
  ISOLATED_WORKSPACE_DEPENDENCY_DIRS,
  ISOLATED_WORKSPACE_EXCLUDED_PREFIXES,
  ISOLATED_WORKSPACE_EXCLUDED_SEGMENTS,
} from './autonomy-loop.types';
import { compact, commandExists } from './autonomy-loop.utils';

function shouldExcludeWorkspaceRelativePath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  if (
    ISOLATED_WORKSPACE_EXCLUDED_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments.some((segment) => ISOLATED_WORKSPACE_EXCLUDED_SEGMENTS.includes(segment));
}

function copyWorkspaceFallback(rootDir: string, workspacePath: string): void {
  copyPath(rootDir, workspacePath, {
    recursive: true,
    preserveTimestamps: true,
    filter: (sourcePath) => {
      const relativePath = path.relative(rootDir, sourcePath);
      if (!relativePath) {
        return true;
      }
      return !shouldExcludeWorkspaceRelativePath(relativePath);
    },
  });
}

function linkWorkspaceDependencyDirectories(rootDir: string, workspacePath: string): void {
  for (const relativePath of ISOLATED_WORKSPACE_DEPENDENCY_DIRS) {
    const sourcePath = path.join(rootDir, relativePath);
    if (!pathExists(sourcePath)) {
      continue;
    }

    const targetPath = path.join(workspacePath, relativePath);
    if (pathExists(targetPath)) {
      continue;
    }

    ensureDir(path.dirname(targetPath), { recursive: true });
    symlinkDir(sourcePath, targetPath);
  }
}

function runWorkspaceCommand(
  workingDir: string,
  command: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: workingDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function ensureWorkspaceGitBaseline(workspacePath: string): string | null {
  const steps: Array<[string, string[]]> = [
    ['git', ['init', '-q']],
    ['git', ['config', 'user.name', 'PULSE Worker']],
    ['git', ['config', 'user.email', 'pulse@local']],
    ['git', ['add', '-A']],
    ['git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'pulse worker baseline']],
  ];

  for (const [command, args] of steps) {
    const result = runWorkspaceCommand(workspacePath, command, args);
    if (result.status !== 0) {
      return compact(
        result.stderr || result.stdout || `Failed to run ${command} ${args.join(' ')}.`,
        400,
      );
    }
  }

  return null;
}

/** Prepare isolated worker workspace. */
export function prepareIsolatedWorkerWorkspace(
  rootDir: string,
  workerId: string,
): PulseWorkerWorkspace {
  const registry = buildArtifactRegistry(rootDir);
  const workspaceRoot = path.join(
    registry.tempDir,
    'agent-workspaces',
    `${Date.now().toString(36)}-${workerId}`,
  );
  const workspacePath = path.join(workspaceRoot, 'repo');
  ensureDir(workspaceRoot, { recursive: true });

  if (commandExists('rsync', rootDir)) {
    const rsync = spawnSync(
      'rsync',
      [
        '-a',
        '--delete',
        '--exclude=.git',
        '--exclude=.pulse/tmp',
        '--exclude=coverage',
        '--exclude=.turbo',
        '--exclude=node_modules',
        '--exclude=.next',
        `${rootDir}/`,
        `${workspacePath}/`,
      ],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    if (rsync.status !== 0) {
      throw new Error(
        compact(rsync.stderr || rsync.stdout || 'rsync workspace clone failed.', 400),
      );
    }
  } else {
    copyWorkspaceFallback(rootDir, workspacePath);
  }

  linkWorkspaceDependencyDirectories(rootDir, workspacePath);
  const baselineError = ensureWorkspaceGitBaseline(workspacePath);
  if (baselineError) {
    throw new Error(`Unable to initialize isolated workspace for ${workerId}: ${baselineError}`);
  }

  return {
    workspaceMode: 'isolated_copy',
    workspacePath,
    patchPath: path.join(workspaceRoot, `${workerId}.patch`),
  };
}

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

/** Apply worker patch to root. */
export function applyWorkerPatchToRoot(
  rootDir: string,
  patchPath: string,
  workerId: string,
): { status: 'applied' | 'failed'; summary: string } {
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
export function detectRollbackGuard(
  rootDir: string,
): import('./autonomy-loop.types').PulseRollbackGuard {
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
