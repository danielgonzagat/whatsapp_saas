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

export interface PulseWorkerLeaseValidationInput {
  leaseId?: string;
  leaseStatus?: string;
  leaseExpiresAt?: string;
  ownedFiles?: string[];
  forbiddenFiles?: string[];
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeLeasePath(filePath: string, rootDir?: string): string | null {
  const trimmed = filePath.trim().replace(/\s+\(\d+\)$/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return null;
  }
  const slashNormalized = normalizeRepoPath(trimmed);
  const relativePath =
    rootDir && path.isAbsolute(slashNormalized)
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
  ) {
    return null;
  }
  return normalized;
}

function violatesForbiddenFile(filePath: string, forbiddenFiles: string[]): boolean {
  const normalized = normalizeRepoPath(filePath);
  return forbiddenFiles.some((forbidden) => {
    const entry = normalizeRepoPath(forbidden);
    return normalized === entry || normalized.startsWith(entry.endsWith('/') ? entry : `${entry}/`);
  });
}

export function validateChangedFilesAgainstLease(
  changedFiles: string[],
  lease: PulseWorkerLeaseValidationInput,
  rootDir?: string,
): string | null {
  if (lease.leaseStatus && lease.leaseStatus !== 'active') {
    return `Worker lease ${lease.leaseId || 'missing'} is ${lease.leaseStatus}.`;
  }
  if (lease.leaseExpiresAt) {
    const expiresAt = Date.parse(lease.leaseExpiresAt);
    if (Number.isNaN(expiresAt)) {
      return `Worker lease ${lease.leaseId || 'missing'} has an invalid expiration timestamp.`;
    }
    if (expiresAt <= Date.now()) {
      return `Worker lease ${lease.leaseId || 'missing'} expired at ${lease.leaseExpiresAt}.`;
    }
  }
  const ownedFiles = new Set<string>();
  for (const filePath of lease.ownedFiles || []) {
    const normalized = normalizeLeasePath(filePath, rootDir);
    if (!normalized) {
      return `${filePath} is an invalid ownedFiles entry for worker lease ${lease.leaseId || 'missing'}.`;
    }
    if (violatesForbiddenFile(normalized, lease.forbiddenFiles || [])) {
      return `${normalized} is forbidden and cannot be owned by worker lease ${lease.leaseId || 'missing'}.`;
    }
    ownedFiles.add(normalized);
  }
  const forbiddenFiles = lease.forbiddenFiles || [];
  if (ownedFiles.size === 0 && changedFiles.length > 0) {
    return `Worker lease ${lease.leaseId || 'missing'} has no ownedFiles but changed ${changedFiles.length} file(s).`;
  }
  for (const filePath of changedFiles) {
    const normalized = normalizeLeasePath(filePath, rootDir);
    if (!normalized) {
      return `${filePath} is an invalid changed path for worker lease ${lease.leaseId || 'missing'}.`;
    }
    if (violatesForbiddenFile(normalized, forbiddenFiles)) {
      return `${normalized} is forbidden by worker lease ${lease.leaseId || 'missing'}.`;
    }
    if (ownedFiles.size > 0 && !ownedFiles.has(normalized)) {
      return `${normalized} is outside ownedFiles for worker lease ${lease.leaseId || 'missing'}.`;
    }
  }
  return null;
}

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
import "./__companions__/autonomy-loop.workspace.companion";
