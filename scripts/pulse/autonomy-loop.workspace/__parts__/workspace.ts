import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildArtifactRegistry } from '../../artifact-registry/__parts__/registry';
import { copyPath, ensureDir, pathExists, symlinkDir } from '../../safe-fs';
import { compact, commandExists } from '../../autonomy-loop.utils';
import type { PulseWorkerWorkspace } from '../../autonomy-loop.types';
import {
  ISOLATED_WORKSPACE_DEPENDENCY_DIRS,
  ISOLATED_WORKSPACE_EXCLUDED_PREFIXES,
  ISOLATED_WORKSPACE_EXCLUDED_SEGMENTS,
} from '../../autonomy-loop.types';

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

export function runWorkspaceCommand(
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
