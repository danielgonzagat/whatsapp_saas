import type { SandboxExecutionResult } from '../autonomous-executor-policy';

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
