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

function pathSegments(relPath: string): string[] {
  return normalizeRelPath(relPath)
    .split('/')
    .flatMap((segment) => segment.split(/[.\-_]/))
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

function hasSecretPathEvidence(rootDir: string, relPath: string): boolean {
  const absolutePath = path.join(resolveRoot(rootDir), relPath);
  const basename = path.basename(relPath).toLowerCase();
  if (basename.startsWith('.env')) {
    return true;
  }

  if (!pathExists(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  const sample = fs.readFileSync(absolutePath, 'utf8').slice(0, 4096);
  const assignmentLines = sample
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('=') && !line.startsWith('#'));
  if (assignmentLines.length === 0) {
    return false;
  }
  const secretLikeLines = assignmentLines.filter((line) =>
    pathSegments(line.split('=')[0] ?? '').some((token) => {
      const sensitiveEvidenceTerms = ['secret', 'token', 'key', 'password', 'credential'];
      return sensitiveEvidenceTerms.includes(token);
    }),
  );
  return secretLikeLines.length > 0;
}

function hasMigrationArtifactEvidence(rootDir: string, relPath: string): boolean {
  const segments = pathSegments(relPath);
  if (segments.includes('migrations') || path.basename(relPath) === 'schema.prisma') {
    return (
      segments.includes('prisma') ||
      segments.includes('migration') ||
      segments.includes('migrations')
    );
  }

  const absolutePath = path.join(resolveRoot(rootDir), relPath);
  if (!pathExists(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  const sample = fs.readFileSync(absolutePath, 'utf8').slice(0, 4096).toLowerCase();
  return (
    sample.includes('create table') || sample.includes('alter table') || sample.includes('model ')
  );
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
  if (hasSecretPathEvidence(rootDir, target)) {
    blockedReasons.push({
      code: 'secret_path',
      target,
      reason: 'Environment files are blocked from sandbox proof execution.',
    });
  }
  if (hasMigrationArtifactEvidence(rootDir, target)) {
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
import "./__companions__/real-sandbox.companion";
