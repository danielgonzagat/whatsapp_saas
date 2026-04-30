import * as fs from 'fs';
import * as path from 'path';

import type { SandboxExecutionResult } from './autonomous-executor-policy';
import { ensureDir, pathExists, readJsonFile } from './safe-fs';

export type RealSandboxPlanStatus = 'ready' | 'blocked';
export type RealSandboxCommandKind = 'read_only' | 'validation' | 'patch_check' | 'patch_apply';
export type RealSandboxEvidenceStatus =
  | 'not_required'
  | 'planned'
  | 'passed'
  | 'failed'
  | 'blocked';

export interface RealSandboxProtectedBoundary {
  protectedExact: readonly string[];
  protectedPrefixes: readonly string[];
}

export interface RealSandboxCommandPlan {
  command: string;
  kind: RealSandboxCommandKind;
}

export interface RealSandboxBlockedReason {
  code:
    | 'path_outside_root'
    | 'protected_path'
    | 'secret_path'
    | 'migration_path'
    | 'patch_path'
    | 'patch_read_failed'
    | 'destructive_command'
    | 'unapproved_command';
  target: string;
  reason: string;
}

export interface RealSandboxPatchPlan {
  patchPath: string | null;
  status: 'not_provided' | 'ready' | 'blocked';
  changedFiles: readonly string[];
  checkCommand: string | null;
  applyCommand: string | null;
  blockedReasons: readonly RealSandboxBlockedReason[];
}

export interface RealSandboxLifecycleEvidence {
  workspaceCreated: RealSandboxEvidenceStatus;
  workspaceMaterialized: RealSandboxEvidenceStatus;
  patchChecked: RealSandboxEvidenceStatus;
  patchApplied: RealSandboxEvidenceStatus;
  validationPassed: RealSandboxEvidenceStatus;
}

export interface RealSandboxWorkspacePlan {
  workspaceId: string;
  rootDir: string;
  workspacePath: string;
  generatedAt: string;
  status: RealSandboxPlanStatus;
  touchedPaths: readonly string[];
  commands: readonly RealSandboxCommandPlan[];
  patch: RealSandboxPatchPlan;
  lifecycle: RealSandboxLifecycleEvidence;
  blockedReasons: readonly RealSandboxBlockedReason[];
  isolatedWorkspacePathPlan: {
    strategy: 'directory_workspace';
    sourceRoot: string;
    workspacePath: string;
  };
}

export interface BuildRealSandboxPlanInput {
  rootDir: string;
  touchedPaths?: readonly string[];
  commands?: readonly string[];
  patchPath?: string | null;
  workspaceBaseDir?: string;
  generatedAt?: string;
  workspaceId?: string;
  protectedBoundary?: RealSandboxProtectedBoundary;
}

export interface ProcessRunnerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface ProcessRunnerOptions {
  cwd: string;
  commandKind: RealSandboxCommandKind;
}

export type ProcessRunner = (
  command: string,
  options: ProcessRunnerOptions,
) => ProcessRunnerResult | Promise<ProcessRunnerResult>;

export interface ExecuteRealSandboxInput {
  plan: RealSandboxWorkspacePlan;
  runner: ProcessRunner;
}

export interface RealSandboxExecutionCommandResult {
  command: string;
  kind: RealSandboxCommandKind;
  exitCode: number | null;
  skipped: boolean;
}

export interface RealSandboxExecutionResult extends SandboxExecutionResult {
  planStatus: RealSandboxPlanStatus;
  evidenceStatus: 'passed' | 'failed' | 'blocked';
  lifecycle: RealSandboxLifecycleEvidence;
  patch: RealSandboxPatchPlan;
  commands: readonly RealSandboxExecutionCommandResult[];
  blockedReasons: readonly RealSandboxBlockedReason[];
}

const DEFAULT_PROTECTED_BOUNDARY: RealSandboxProtectedBoundary = {
  protectedExact: [
    'AGENTS.md',
    'CLAUDE.md',
    'CODEX.md',
    '.codacy.yml',
    'package.json',
    '.husky/pre-push',
    'backend/eslint.config.mjs',
    'frontend/eslint.config.mjs',
    'worker/eslint.config.mjs',
  ],
  protectedPrefixes: ['.github/workflows/', 'docs/codacy/', 'docs/design/', 'ops/', 'scripts/ops/'],
};

const GOVERNANCE_BOUNDARY_PATH = 'ops/protected-governance-files.json';
const SECRET_PATH_RE = /(^|\/)\.env(?:[./-]|$)/i;
const MIGRATION_PATH_RE = /(^|\/)(?:backend\/prisma|prisma)\/migrations(?:\/|$)/i;
const PRISMA_SCHEMA_RE = /(^|\/)(?:backend\/prisma|prisma)\/schema\.prisma$/i;
const APPROVED_COMMAND_RE =
  /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:lint|typecheck|test|build|check(?::[\w-]+)?|pulse(?::[\w-]+)?)\b|npx\s+vitest\s+run\b|node\s+scripts\/pulse\/run\.js\b|git\s+(?:status|diff|show|log|branch)\b)/;
const VALIDATION_COMMAND_RE =
  /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:lint|typecheck|test|build|check(?::[\w-]+)?|pulse(?::[\w-]+)?)\b|npx\s+vitest\s+run\b|node\s+scripts\/pulse\/run\.js\b)/;
const DESTRUCTIVE_COMMAND_RE =
  /\b(?:rm\s+-[A-Za-z]*r[A-Za-z]*|git\s+(?:reset|restore|checkout|clean|push|rebase|commit)|prisma\s+(?:migrate\s+(?:dev|deploy|reset|resolve)|db\s+push)|(?:drop|truncate)\s+(?:table|database|schema)|delete\s+from|migration\s+reset)\b/i;

function normalizeRelPath(candidate: string): string {
  return candidate.replaceAll('\\', '/').replace(/^\.\//, '');
}

function resolveRoot(rootDir: string): string {
  return path.resolve(rootDir);
}

function resolveInsideRoot(
  rootDir: string,
  candidate: string,
): { inside: boolean; relPath: string } {
  const root = resolveRoot(rootDir);
  const resolved = path.resolve(root, candidate);
  const inside = resolved === root || resolved.startsWith(root + path.sep);
  return {
    inside,
    relPath: normalizeRelPath(path.relative(root, resolved)),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizePrefix(prefix: string): string {
  const normalized = normalizeRelPath(prefix);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

function quoteCommandArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function stableWorkspaceId(
  rootDir: string,
  touchedPaths: readonly string[],
  commands: readonly string[],
): string {
  const source = `${resolveRoot(rootDir)}:${touchedPaths.join('|')}:${commands.join('|')}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `real-sandbox-${hash.toString(36)}`;
}

function loadProtectedBoundary(rootDir: string): RealSandboxProtectedBoundary {
  const boundaryPath = path.join(resolveRoot(rootDir), GOVERNANCE_BOUNDARY_PATH);
  if (!pathExists(boundaryPath)) {
    return DEFAULT_PROTECTED_BOUNDARY;
  }

  try {
    const parsed = readJsonFile<{
      protectedExact?: string[];
      protectedPrefixes?: string[];
    }>(boundaryPath);
    return {
      protectedExact: parsed.protectedExact ?? DEFAULT_PROTECTED_BOUNDARY.protectedExact,
      protectedPrefixes: parsed.protectedPrefixes ?? DEFAULT_PROTECTED_BOUNDARY.protectedPrefixes,
    };
  } catch {
    return DEFAULT_PROTECTED_BOUNDARY;
  }
}

function isProtectedPath(relPath: string, boundary: RealSandboxProtectedBoundary): boolean {
  const normalized = normalizeRelPath(relPath);
  if (boundary.protectedExact.map(normalizeRelPath).includes(normalized)) {
    return true;
  }
  return boundary.protectedPrefixes
    .map(normalizePrefix)
    .some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

function classifyPath(
  rootDir: string,
  candidate: string,
  boundary: RealSandboxProtectedBoundary,
): { relPath: string; blockedReasons: RealSandboxBlockedReason[] } {
  const resolved = resolveInsideRoot(rootDir, candidate);
  const target = resolved.relPath || '.';
  const blockedReasons: RealSandboxBlockedReason[] = [];

  if (!resolved.inside) {
    blockedReasons.push({
      code: 'path_outside_root',
      target: candidate,
      reason: 'Path resolves outside the repository root.',
    });
    return { relPath: target, blockedReasons };
  }

  if (isProtectedPath(target, boundary)) {
    blockedReasons.push({
      code: 'protected_path',
      target,
      reason: 'Path is protected by governance boundary.',
    });
  }
  if (SECRET_PATH_RE.test(target)) {
    blockedReasons.push({
      code: 'secret_path',
      target,
      reason: 'Environment files are blocked from sandbox proof execution.',
    });
  }
  if (MIGRATION_PATH_RE.test(target) || PRISMA_SCHEMA_RE.test(target)) {
    blockedReasons.push({
      code: 'migration_path',
      target,
      reason: 'Migration and Prisma schema paths require human-governed handling.',
    });
  }

  return { relPath: target, blockedReasons };
}

function normalizePatchFilePath(candidate: string): string | null {
  const normalized = normalizeRelPath(candidate.trim());
  if (normalized === '/dev/null' || normalized === 'dev/null') {
    return null;
  }
  return normalized.replace(/^(?:a|b)\//, '');
}

function extractChangedFilesFromPatch(patchContent: string): string[] {
  const changed = new Set<string>();

  for (const line of patchContent.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git\s+a\/(.+?)\s+b\/(.+)$/.exec(line);
      if (match) {
        const beforePath = normalizePatchFilePath(match[1]);
        const afterPath = normalizePatchFilePath(match[2]);
        if (beforePath) changed.add(beforePath);
        if (afterPath) changed.add(afterPath);
      }
      continue;
    }

    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      const patchPath = normalizePatchFilePath(line.slice(4));
      if (patchPath) changed.add(patchPath);
    }
  }

  return [...changed].sort();
}

function buildPatchPlan(
  rootDir: string,
  patchPath: string | null | undefined,
  boundary: RealSandboxProtectedBoundary,
): RealSandboxPatchPlan {
  if (!patchPath) {
    return {
      patchPath: null,
      status: 'not_provided',
      changedFiles: [],
      checkCommand: null,
      applyCommand: null,
      blockedReasons: [],
    };
  }

  const resolved = resolveInsideRoot(rootDir, patchPath);
  const blockedReasons: RealSandboxBlockedReason[] = [];
  if (!resolved.inside) {
    blockedReasons.push({
      code: 'patch_path',
      target: patchPath,
      reason: 'Patch file must live inside the repository root.',
    });
  }

  const absolutePatchPath = path.resolve(resolveRoot(rootDir), patchPath);
  let patchContent = '';
  if (blockedReasons.length === 0) {
    try {
      patchContent = fs.readFileSync(absolutePatchPath, 'utf8');
    } catch {
      blockedReasons.push({
        code: 'patch_read_failed',
        target: resolved.relPath,
        reason: 'Patch file could not be read for sandbox planning.',
      });
    }
  }

  const changedFiles = patchContent ? extractChangedFilesFromPatch(patchContent) : [];
  for (const changedFile of changedFiles) {
    blockedReasons.push(...classifyPath(rootDir, changedFile, boundary).blockedReasons);
  }

  const normalizedPatchPath = resolved.inside
    ? path.join(resolveRoot(rootDir), resolved.relPath)
    : null;
  return {
    patchPath: normalizedPatchPath,
    status: blockedReasons.length > 0 ? 'blocked' : 'ready',
    changedFiles,
    checkCommand: normalizedPatchPath
      ? `git apply --check ${quoteCommandArg(normalizedPatchPath)}`
      : null,
    applyCommand: normalizedPatchPath ? `git apply ${quoteCommandArg(normalizedPatchPath)}` : null,
    blockedReasons,
  };
}

function classifyCommand(command: string): {
  command: string;
  plan: RealSandboxCommandPlan | null;
  blockedReason: RealSandboxBlockedReason | null;
} {
  const normalized = normalizeCommand(command);
  if (DESTRUCTIVE_COMMAND_RE.test(normalized)) {
    return {
      command: normalized,
      plan: null,
      blockedReason: {
        code: 'destructive_command',
        target: normalized,
        reason:
          'Command is destructive or can mutate git, database, migrations, or filesystem state.',
      },
    };
  }

  if (!APPROVED_COMMAND_RE.test(normalized)) {
    return {
      command: normalized,
      plan: null,
      blockedReason: {
        code: 'unapproved_command',
        target: normalized,
        reason: 'Only read-only git inspection and validation/PULSE commands are allowed.',
      },
    };
  }

  return {
    command: normalized,
    plan: {
      command: normalized,
      kind: VALIDATION_COMMAND_RE.test(normalized) ? 'validation' : 'read_only',
    },
    blockedReason: null,
  };
}

export function buildRealSandboxPlan(input: BuildRealSandboxPlanInput): RealSandboxWorkspacePlan {
  const rootDir = resolveRoot(input.rootDir);
  const protectedBoundary = input.protectedBoundary ?? loadProtectedBoundary(rootDir);
  const patch = buildPatchPlan(rootDir, input.patchPath, protectedBoundary);
  const pathResults = unique(input.touchedPaths ?? []).map((candidate) =>
    classifyPath(rootDir, candidate, protectedBoundary),
  );
  const commandResults = unique(input.commands ?? []).map(classifyCommand);
  const touchedPaths = pathResults.map((result) => result.relPath);
  const commands = commandResults.flatMap((result) => (result.plan ? [result.plan] : []));
  const blockedReasons = [
    ...pathResults.flatMap((result) => result.blockedReasons),
    ...patch.blockedReasons,
    ...commandResults.flatMap((result) => (result.blockedReason ? [result.blockedReason] : [])),
  ];
  const workspaceId =
    input.workspaceId ??
    stableWorkspaceId(
      rootDir,
      touchedPaths,
      commands.map((entry) => entry.command),
    );
  const workspaceBaseDir = input.workspaceBaseDir ?? path.join(rootDir, '.pulse', 'real-sandboxes');
  const workspacePath = path.join(resolveRoot(workspaceBaseDir), workspaceId);

  return {
    workspaceId,
    rootDir,
    workspacePath,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: blockedReasons.length > 0 ? 'blocked' : 'ready',
    touchedPaths: unique([...touchedPaths, ...patch.changedFiles]).sort(),
    commands,
    patch,
    lifecycle: {
      workspaceCreated: blockedReasons.length > 0 ? 'blocked' : 'planned',
      workspaceMaterialized: blockedReasons.length > 0 ? 'blocked' : 'planned',
      patchChecked:
        patch.status === 'not_provided'
          ? 'not_required'
          : blockedReasons.length > 0
            ? 'blocked'
            : 'planned',
      patchApplied:
        patch.status === 'not_provided'
          ? 'not_required'
          : blockedReasons.length > 0
            ? 'blocked'
            : 'planned',
      validationPassed:
        commands.length === 0 ? 'not_required' : blockedReasons.length > 0 ? 'blocked' : 'planned',
    },
    blockedReasons,
    isolatedWorkspacePathPlan: {
      strategy: 'directory_workspace',
      sourceRoot: rootDir,
      workspacePath,
    },
  };
}

function copyFileIntoWorkspace(rootDir: string, workspacePath: string, relativePath: string): void {
  const sourcePath = path.join(rootDir, relativePath);
  const targetPath = path.join(workspacePath, relativePath);
  ensureDir(path.dirname(targetPath), { recursive: true });

  if (!pathExists(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
}

function materializeWorkspace(plan: RealSandboxWorkspacePlan): void {
  ensureDir(plan.workspacePath, { recursive: true });
  for (const relativePath of plan.touchedPaths) {
    copyFileIntoWorkspace(plan.rootDir, plan.workspacePath, relativePath);
  }
}

export async function executeRealSandbox(
  input: ExecuteRealSandboxInput,
): Promise<RealSandboxExecutionResult> {
  const { plan, runner } = input;

  if (plan.status === 'blocked') {
    return {
      executed: false,
      isolatedWorktree: true,
      workspacePath: plan.workspacePath,
      exitCode: null,
      summary: `Sandbox execution blocked by policy: ${plan.blockedReasons
        .map((entry) => entry.code)
        .join(', ')}`,
      planStatus: plan.status,
      evidenceStatus: 'blocked',
      lifecycle: plan.lifecycle,
      patch: plan.patch,
      commands: plan.commands.map((command) => ({
        ...command,
        exitCode: null,
        skipped: true,
      })),
      blockedReasons: plan.blockedReasons,
    };
  }

  const lifecycle: RealSandboxLifecycleEvidence = {
    ...plan.lifecycle,
    workspaceCreated: 'passed',
  };
  materializeWorkspace(plan);
  lifecycle.workspaceMaterialized = 'passed';

  const commandResults: RealSandboxExecutionCommandResult[] = [];
  if (plan.patch.status === 'ready') {
    const patchCommands = [
      { command: plan.patch.checkCommand, kind: 'patch_check' as const },
      { command: plan.patch.applyCommand, kind: 'patch_apply' as const },
    ];

    for (const patchCommand of patchCommands) {
      if (!patchCommand.command) continue;
      const result = await runner(patchCommand.command, {
        cwd: plan.workspacePath,
        commandKind: patchCommand.kind,
      });
      commandResults.push({
        command: patchCommand.command,
        kind: patchCommand.kind,
        exitCode: result.exitCode,
        skipped: false,
      });
      if (patchCommand.kind === 'patch_check') {
        lifecycle.patchChecked = result.exitCode === 0 ? 'passed' : 'failed';
      }
      if (patchCommand.kind === 'patch_apply') {
        lifecycle.patchApplied = result.exitCode === 0 ? 'passed' : 'failed';
      }
      if (result.exitCode !== 0) {
        return {
          executed: true,
          isolatedWorktree: true,
          workspacePath: plan.workspacePath,
          exitCode: result.exitCode,
          summary: `Sandbox patch lifecycle failed: ${patchCommand.command}`,
          planStatus: plan.status,
          evidenceStatus: 'failed',
          lifecycle,
          patch: plan.patch,
          commands: commandResults,
          blockedReasons: [],
        };
      }
    }
  }

  for (const command of plan.commands) {
    const result = await runner(command.command, {
      cwd: plan.workspacePath,
      commandKind: command.kind,
    });
    commandResults.push({
      command: command.command,
      kind: command.kind,
      exitCode: result.exitCode,
      skipped: false,
    });
    if (result.exitCode !== 0) {
      return {
        executed: true,
        isolatedWorktree: true,
        workspacePath: plan.workspacePath,
        exitCode: result.exitCode,
        summary: `Sandbox command failed: ${command.command}`,
        planStatus: plan.status,
        evidenceStatus: 'failed',
        lifecycle: {
          ...lifecycle,
          validationPassed: 'failed',
        },
        patch: plan.patch,
        commands: commandResults,
        blockedReasons: [],
      };
    }
  }
  lifecycle.validationPassed = plan.commands.length === 0 ? 'not_required' : 'passed';

  return {
    executed: true,
    isolatedWorktree: true,
    workspacePath: plan.workspacePath,
    exitCode: 0,
    summary: `Sandbox executed ${commandResults.length} command(s) in isolated workspace path.`,
    planStatus: plan.status,
    evidenceStatus: 'passed',
    lifecycle,
    patch: plan.patch,
    commands: commandResults,
    blockedReasons: [],
  };
}
