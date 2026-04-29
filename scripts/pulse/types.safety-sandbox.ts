// PULSE — Live Codebase Nervous System
// Safety Sandbox types (Wave 9)

/**
 * Classification of destructive actions that require safety gating.
 *
 * Each kind maps to a different risk profile with specific requirements
 * for human approval, dry-run execution, backup, and sandbox isolation.
 */
export type DestructiveActionKind =
  | 'migration'
  | 'external_state_mutation'
  | 'access_boundary_change'
  | 'infra_change'
  | 'secret_access'
  | 'delete_operation'
  | 'governance_change'
  | 'protected_file_edit';

/**
 * A classified destructive action that PULSE must gate before allowing.
 *
 * Each action carries a set of safety requirements that must be satisfied
 * before execution — human approval, dry-run validation, backup creation,
 * and/or sandbox isolation.
 */
export interface DestructiveAction {
  /** Unique identifier for this action instance. */
  actionId: string;
  /** The kind of destructive action. */
  kind: DestructiveActionKind;
  /** Human-readable description of what this action does. */
  description: string;
  /** The file path targeted by this action, or null if not file-specific. */
  targetFile: string | null;
  /** Whether this action requires explicit human approval before execution. */
  requiresHumanApproval: boolean;
  /** Whether this action requires a dry-run validation step. */
  requiresDryRun: boolean;
  /** Whether this action requires a backup to be created before execution. */
  requiresBackup: boolean;
  /** Whether this action must only be performed in a sandbox workspace. */
  sandboxOnly: boolean;
}

/**
 * A sandbox workspace for safely testing destructive changes.
 *
 * Workspaces are git worktrees that isolate changes from the main
 * branch, allowing validation without risk to the primary workspace.
 */
export interface SandboxWorkspace {
  /** Absolute path to the sandbox workspace directory. */
  workspacePath: string;
  /** The parent branch from which this workspace was created. */
  parentBranch: string;
  /** ISO-8601 timestamp of workspace creation. */
  createdAt: string;
  /** Files touched by patches in this workspace. */
  filesTouched: string[];
  /** Patches applied to this workspace with safety classification. */
  patches: Array<{
    /** Relative file path within the repository. */
    filePath: string;
    /** The patch content as a unified diff string. */
    patchContent: string;
    /** Whether the patch was validated as safe (no protected file violations). */
    safe: boolean;
  }>;
  /** Validation commands run on this workspace and their results. */
  validationResults: Array<{
    /** The command that was run. */
    command: string;
    /** Whether validation passed. */
    passed: boolean;
    /** Command output (stdout + stderr). */
    output: string;
  }>;
  /** Current lifecycle status of the workspace. */
  status: 'active' | 'validated' | 'rejected' | 'applied' | 'cleaned_up';
}

/**
 * Complete state of the PULSE Safety Sandbox system.
 *
 * Tracks all classified destructive actions, active sandbox workspaces,
 * and the set of protected files governed by repository policy.
 */
export interface SandboxState {
  /** ISO-8601 timestamp of when this state was generated. */
  generatedAt: string;
  /** All classified destructive actions. */
  destructiveActions: DestructiveAction[];
  /** Currently active sandbox workspaces. */
  activeWorkspaces: SandboxWorkspace[];
  /** Protected files loaded from governance configuration. */
  protectedFiles: string[];
  /** Aggregate counts for quick status assessment. */
  summary: {
    /** Total number of destructive actions classified. */
    totalDestructiveActions: number;
    /** Number of actions requiring human approval. */
    humanRequiredActions: number;
    /** Number of actions restricted to sandbox-only execution. */
    sandboxOnlyActions: number;
    /** Number of currently active sandbox workspaces. */
    activeWorkspaces: number;
  };
}
