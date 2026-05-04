// PULSE — Live Codebase Nervous System
// Safety Sandbox types (Wave 9.3)

/**
 * Classification of destructive actions that require safety gating.
 *
 * Each kind maps to a different risk profile with specific requirements
 * for PULSE-governed sandbox validation, dry-run execution, backup,
 * rollback proof, and isolation.
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
 * Risk level for destructive actions following the
 * Agent Operating Protocol risk classification.
 *
 *   - `safe`     — Risk 0: no risk (docs, tests, minor UI)
 *   - `normal`   — Risk 1: frontend, hooks, API clients, non-financial services
 *   - `high`     — Risk 2: auth, workspace isolation, WhatsApp, queues, external integrations
 *   - `critical` — Risk 3: payments, wallet, ledger, split, payout, KYC, secrets, CI/CD, governance
 */
export type SandboxRiskLevel = 'safe' | 'normal' | 'high' | 'critical';

/**
 * A classified destructive action that PULSE must gate before allowing.
 *
 * Each action carries a set of safety requirements that must be satisfied
 * before execution: sandbox validation, dry-run evidence, backup creation,
 * rollback proof, and/or isolation.
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
  /** Risk level classification (Risk 0–3). */
  riskLevel: SandboxRiskLevel;
  /**
   * Legacy compatibility field.
   *
   * PULSE safety decisions ignore this field; generated values remain `false`
   * so older consumers can compile while reading the governed fields.
   */
  requiresHumanApproval: boolean;
  /** Whether this action must pass PULSE-governed sandbox validation. */
  requiresGovernedSandbox: boolean;
  /** Whether this action requires a dry-run validation step. */
  requiresDryRun: boolean;
  /** Whether this action requires a backup to be created before execution. */
  requiresBackup: boolean;
  /** Whether rollback proof must be generated before execution can proceed. */
  requiresRollbackProof: boolean;
  /** Whether this action must only be performed in a sandbox workspace. */
  sandboxOnly: boolean;
}

/**
 * Isolation rules that define how a sandbox workspace must be configured
 * for a specific kind of destructive action.
 */
export interface SandboxIsolationRules {
  /** The action kind these rules apply to. */
  kind: DestructiveActionKind;
  /** Whether a separate git worktree is required. */
  requiresSeparateWorktree: boolean;
  /** Whether the sandbox must have network isolation (no external calls). */
  requiresNetworkIsolation: boolean;
  /** Whether the sandbox must use a cloned database or dry-run mode. */
  requiresDatabaseIsolation: boolean;
  /** Files or directories that must NOT be accessible within the sandbox. */
  blockedPaths: string[];
  /** Commands that must run and pass before the sandbox is considered valid. */
  preValidationCommands: string[];
  /** Commands that must run and pass after applying a patch. */
  postValidationCommands: string[];
  /** Maximum time (in minutes) the sandbox can remain active without explicit extension. */
  maxActiveMinutes: number;
}

/**
 * A sandbox workspace for safely testing destructive changes.
 *
 * Workspaces are logical isolation units that simulate git worktree isolation
 * for planning purposes, without performing actual disk clones.
 */
export interface SandboxWorkspace {
  /** Absolute path to the sandbox workspace directory. */
  workspacePath: string;
  /** The parent branch from which this workspace was created. */
  parentBranch: string;
  /** ISO-8601 timestamp of workspace creation. */
  createdAt: string;
  /** ISO-8601 timestamp when the workspace expires (createdAt + maxActiveMinutes). */
  expiresAt: string;
  /** Files touched by patches in this workspace. */
  filesTouched: string[];
  /** Risk level of the most dangerous action in this workspace. */
  maxRiskLevel: SandboxRiskLevel;
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
  /** The action kinds allowed in this workspace (derived from patches). */
  allowedActionKinds: DestructiveActionKind[];
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
  /** Isolation rules configured per action kind. */
  isolationRules: SandboxIsolationRules[];
  /** Aggregate counts for quick status assessment. */
  summary: {
    /** Total number of destructive actions classified. */
    totalDestructiveActions: number;
    /**
     * Legacy compatibility counter.
     *
     * PULSE safety decisions use `governedSandboxActions`; this remains 0.
     */
    humanRequiredActions: number;
    /** Number of actions requiring PULSE-governed sandbox validation. */
    governedSandboxActions: number;
    /** Number of actions restricted to sandbox-only execution. */
    sandboxOnlyActions: number;
    /** Number of currently active sandbox workspaces. */
    activeWorkspaces: number;
    /** Breakdown of actions by risk level. */
    riskBreakdown: Record<SandboxRiskLevel, number>;
    /** Number of actions classified as governance-violating. */
    governanceViolations: number;
  };
}
