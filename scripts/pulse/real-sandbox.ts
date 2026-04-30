import * as path from 'path';

import type { SandboxExecutionResult } from './autonomous-executor-policy';
import { ensureDir, pathExists, readJsonFile } from './safe-fs';

export type RealSandboxPlanStatus = 'ready' | 'blocked';
export type RealSandboxCommandKind = 'read_only' | 'validation';

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
    | 'destructive_command'
    | 'unapproved_command';
  target: string;
  reason: string;
}

export interface RealSandboxWorkspacePlan {
  workspaceId: string;
  rootDir: string;
  workspacePath: string;
  generatedAt: string;
  status: RealSandboxPlanStatus;
  touchedPaths: readonly string[];
  commands: readonly RealSandboxCommandPlan[];
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
  const pathResults = unique(input.touchedPaths ?? []).map((candidate) =>
    classifyPath(rootDir, candidate, protectedBoundary),
  );
  const commandResults = unique(input.commands ?? []).map(classifyCommand);
  const touchedPaths = pathResults.map((result) => result.relPath);
  const commands = commandResults.flatMap((result) => (result.plan ? [result.plan] : []));
  const blockedReasons = [
    ...pathResults.flatMap((result) => result.blockedReasons),
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
    touchedPaths,
    commands,
    blockedReasons,
    isolatedWorkspacePathPlan: {
      strategy: 'directory_workspace',
      sourceRoot: rootDir,
      workspacePath,
    },
  };
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
      commands: plan.commands.map((command) => ({
        ...command,
        exitCode: null,
        skipped: true,
      })),
      blockedReasons: plan.blockedReasons,
    };
  }

  ensureDir(plan.workspacePath, { recursive: true });

  const commandResults: RealSandboxExecutionCommandResult[] = [];
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
        commands: commandResults,
        blockedReasons: [],
      };
    }
  }

  return {
    executed: true,
    isolatedWorktree: true,
    workspacePath: plan.workspacePath,
    exitCode: 0,
    summary: `Sandbox executed ${commandResults.length} command(s) in isolated workspace path.`,
    planStatus: plan.status,
    commands: commandResults,
    blockedReasons: [],
  };
}
