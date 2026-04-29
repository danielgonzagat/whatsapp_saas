// PULSE — Live Codebase Nervous System
// Safety Sandbox (Wave 9.3)
//
// Classifies destructive operations by risk level, defines isolation
// rules per operation type, simulates logical sandbox workspaces for
// planning validation, and gates autonomous execution of dangerous changes.
//
// This is a PLANNING module — it defines what should happen.
// It does NOT actually clone workspaces, execute patches, or apply migrations.

import * as path from 'path';
import * as fs from 'fs';

import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  DestructiveAction,
  DestructiveActionKind,
  SandboxIsolationRules,
  SandboxRiskLevel,
  SandboxState,
  SandboxWorkspace,
} from './types.safety-sandbox';

const ARTIFACT_FILE_NAME = 'PULSE_SANDBOX_STATE.json';
const PROTECTED_FILES_PATH = 'ops/protected-governance-files.json';

interface ProtectedGovernanceConfig {
  protectedExact: string[];
  protectedPrefixes: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Risk Level Mapping
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map each destructive action kind to its corresponding risk level
 * following the Agent Operating Protocol Risk Classes:
 *
 *   Risk 0 (safe)     — docs, tests, minor UI
 *   Risk 1 (normal)   — frontend, hooks, API clients, non-financial services
 *   Risk 2 (high)     — auth, workspace isolation, WhatsApp, queues, external integrations
 *   Risk 3 (critical) — payments, wallet, ledger, split, payout, KYC, secrets, CI/CD, governance
 */
const KIND_RISK_MAP: Record<DestructiveActionKind, SandboxRiskLevel> = {
  migration: 'critical',
  external_state_mutation: 'critical',
  access_boundary_change: 'high',
  infra_change: 'high',
  secret_access: 'critical',
  delete_operation: 'critical',
  governance_change: 'critical',
  protected_file_edit: 'critical',
};

// ────────────────────────────────────────────────────────────────────────────
// Action Kind Requirements
// ────────────────────────────────────────────────────────────────────────────

/**
 * Action kind definitions with their safety requirements.
 *
 * Each destructive action kind carries a default set of requirements:
 * sandbox validation, dry-run validation, backup creation, and isolated execution.
 */
const ACTION_KIND_REQUIREMENTS: Record<
  DestructiveActionKind,
  {
    requiresGovernedSandbox: boolean;
    requiresDryRun: boolean;
    requiresBackup: boolean;
    requiresRollbackProof: boolean;
    sandboxOnly: boolean;
  }
> = {
  migration: {
    requiresGovernedSandbox: true,
    requiresDryRun: true,
    requiresBackup: true,
    requiresRollbackProof: true,
    sandboxOnly: false,
  },
  external_state_mutation: {
    requiresGovernedSandbox: true,
    requiresDryRun: true,
    requiresBackup: false,
    requiresRollbackProof: true,
    sandboxOnly: true,
  },
  access_boundary_change: {
    requiresGovernedSandbox: true,
    requiresDryRun: true,
    requiresBackup: true,
    requiresRollbackProof: true,
    sandboxOnly: true,
  },
  infra_change: {
    requiresGovernedSandbox: true,
    requiresDryRun: true,
    requiresBackup: true,
    requiresRollbackProof: true,
    sandboxOnly: true,
  },
  secret_access: {
    requiresGovernedSandbox: true,
    requiresDryRun: false,
    requiresBackup: false,
    requiresRollbackProof: false,
    sandboxOnly: true,
  },
  delete_operation: {
    requiresGovernedSandbox: true,
    requiresDryRun: true,
    requiresBackup: true,
    requiresRollbackProof: true,
    sandboxOnly: true,
  },
  governance_change: {
    requiresGovernedSandbox: true,
    requiresDryRun: false,
    requiresBackup: true,
    requiresRollbackProof: true,
    sandboxOnly: false,
  },
  protected_file_edit: {
    requiresGovernedSandbox: true,
    requiresDryRun: true,
    requiresBackup: true,
    requiresRollbackProof: true,
    sandboxOnly: false,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Sandbox Isolation Rules
// ────────────────────────────────────────────────────────────────────────────

/**
 * Default sandbox isolation rules for each destructive action kind.
 *
 * These rules define the minimum sandbox configuration required before
 * a destructive change of the corresponding kind can be validated.
 */
const DEFAULT_ISOLATION_RULES: Record<DestructiveActionKind, SandboxIsolationRules> = {
  migration: {
    kind: 'migration',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: false,
    requiresDatabaseIsolation: true,
    blockedPaths: ['.env', '.env.local', '.env.production'],
    preValidationCommands: ['npm run lint', 'npm run typecheck', 'npx prisma migrate status'],
    postValidationCommands: ['npm test', 'npx prisma migrate deploy --preview-feature'],
    maxActiveMinutes: 60,
  },
  external_state_mutation: {
    kind: 'external_state_mutation',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: true,
    requiresDatabaseIsolation: true,
    blockedPaths: ['.env', '.env.local', '.env.production', 'ops/'],
    preValidationCommands: ['npm run lint', 'npm run typecheck'],
    postValidationCommands: ['npm test'],
    maxActiveMinutes: 30,
  },
  access_boundary_change: {
    kind: 'access_boundary_change',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: false,
    requiresDatabaseIsolation: false,
    blockedPaths: ['.env'],
    preValidationCommands: ['npm run lint', 'npm run typecheck'],
    postValidationCommands: ['npm test -- --testPathPattern="guard|auth"'],
    maxActiveMinutes: 45,
  },
  infra_change: {
    kind: 'infra_change',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: false,
    requiresDatabaseIsolation: false,
    blockedPaths: ['.env', '.env.local', '.env.production'],
    preValidationCommands: ['npm run lint', 'npm run typecheck'],
    postValidationCommands: ['npm test', 'npm run build'],
    maxActiveMinutes: 120,
  },
  secret_access: {
    kind: 'secret_access',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: true,
    requiresDatabaseIsolation: true,
    blockedPaths: ['.env', '.env.local', '.env.production', 'credentials/', 'secrets/'],
    preValidationCommands: [],
    postValidationCommands: [],
    maxActiveMinutes: 15,
  },
  delete_operation: {
    kind: 'delete_operation',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: false,
    requiresDatabaseIsolation: true,
    blockedPaths: ['.env'],
    preValidationCommands: ['npm run lint', 'npm run typecheck'],
    postValidationCommands: ['npm test'],
    maxActiveMinutes: 30,
  },
  governance_change: {
    kind: 'governance_change',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: false,
    requiresDatabaseIsolation: false,
    blockedPaths: [],
    preValidationCommands: ['npm run lint'],
    postValidationCommands: ['npm run ops:validate-governance'],
    maxActiveMinutes: 30,
  },
  protected_file_edit: {
    kind: 'protected_file_edit',
    requiresSeparateWorktree: true,
    requiresNetworkIsolation: false,
    requiresDatabaseIsolation: false,
    blockedPaths: ['.env'],
    preValidationCommands: ['npm run lint'],
    postValidationCommands: ['npm test'],
    maxActiveMinutes: 30,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// File Pattern Detection
// ────────────────────────────────────────────────────────────────────────────

const DESTRUCTIVE_FILE_PATTERNS: Array<{
  pattern: RegExp;
  kind: DestructiveActionKind;
  description: string;
}> = [
  { pattern: /prisma\/migrations\//, kind: 'migration', description: 'Database migration change' },
  { pattern: /prisma\/schema\.prisma$/, kind: 'migration', description: 'Database schema change' },
  { pattern: /\.github\/workflows\//, kind: 'infra_change', description: 'CI/CD workflow change' },
  {
    pattern: /docker|dockerfile/i,
    kind: 'infra_change',
    description: 'Container/infrastructure change',
  },
  { pattern: /\.env/, kind: 'secret_access', description: 'Environment variable access' },
  { pattern: /secret|credential/i, kind: 'secret_access', description: 'Secret/credential access' },
  {
    pattern: /\.codacy\.yml$/,
    kind: 'governance_change',
    description: 'Codacy configuration change',
  },
  {
    pattern: /ops\/governance/,
    kind: 'governance_change',
    description: 'Governance configuration change',
  },
];

const EXTERNAL_MUTATION_RE =
  /\b(?:fetch|axios|httpService|request)\s*(?:<[^>]*>)?\s*\(|\.(?:post|put|patch|delete)\s*\(|\b(?:charge|transfer|refund|withdraw|deposit|capture|authorize|send|dispatch|publish)\w*\s*\(/i;
const ACCESS_BOUNDARY_RE =
  /\b(?:CanActivate|UseGuards|AuthGuard|guard|authorize|authenticate|permission|role|session|token|jwt|signature|verify)\b/i;
const DELETE_OPERATION_RE =
  /\b(?:deleteMany|delete\s*\(|remove\s*\(|truncate|drop\s+table|drop\s+column)\b/i;

// ────────────────────────────────────────────────────────────────────────────
// Structural Content Classification
// ────────────────────────────────────────────────────────────────────────────

function classifyStructuralDestructiveActions(
  relativePath: string,
  content: string,
): Array<{ kind: DestructiveActionKind; description: string }> {
  const actions: Array<{ kind: DestructiveActionKind; description: string }> = [];

  if (DELETE_OPERATION_RE.test(content)) {
    actions.push({ kind: 'delete_operation', description: 'Delete or drop operation detected' });
  }
  if (EXTERNAL_MUTATION_RE.test(content)) {
    actions.push({
      kind: 'external_state_mutation',
      description: 'External or persistent state mutation boundary detected',
    });
  }
  if (ACCESS_BOUNDARY_RE.test(content) || /\.guard\.(?:ts|tsx|js|jsx)$/.test(relativePath)) {
    actions.push({
      kind: 'access_boundary_change',
      description: 'Access-control boundary detected',
    });
  }

  return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Protected Files
// ────────────────────────────────────────────────────────────────────────────

export function loadProtectedFiles(rootDir: string): string[] {
  const configPath = path.join(rootDir, PROTECTED_FILES_PATH);

  if (!pathExists(configPath)) {
    return [];
  }

  try {
    const config = readJsonFile<ProtectedGovernanceConfig>(configPath);
    const files: string[] = [];

    if (config.protectedExact) {
      for (const file of config.protectedExact) {
        files.push(file);
      }
    }

    if (config.protectedPrefixes) {
      for (const prefix of config.protectedPrefixes) {
        const fullPrefix = path.join(rootDir, prefix);
        if (pathExists(fullPrefix)) {
          expandDirectory(fullPrefix, rootDir, files);
        }
      }
    }

    return files;
  } catch {
    return [];
  }
}

function expandDirectory(dirPath: string, rootDir: string, accumulator: string[]): void {
  if (!pathExists(dirPath)) {
    return;
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      expandDirectory(full, rootDir, accumulator);
    } else if (entry.isFile()) {
      accumulator.push(path.relative(rootDir, full));
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Destructive Action Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyDestructiveActions(rootDir: string): DestructiveAction[] {
  const protectedFiles = loadProtectedFiles(rootDir);
  const actions: DestructiveAction[] = [];
  const seen = new Set<string>();

  function walk(dir: string): void {
    if (!pathExists(dir)) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }

      const full = path.join(dir, entry.name);
      const relative = path.relative(rootDir, full);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        for (const { pattern, kind, description } of DESTRUCTIVE_FILE_PATTERNS) {
          if (pattern.test(relative) && !seen.has(`${kind}:${relative}`)) {
            seen.add(`${kind}:${relative}`);
            const reqs = ACTION_KIND_REQUIREMENTS[kind];
            const riskLevel = KIND_RISK_MAP[kind];
            const isProtected = protectedFiles.some(
              (pf) => pf === relative || relative.startsWith(pf + path.sep),
            );

            actions.push({
              actionId: `${kind}:${relative}`,
              kind,
              description: `${description}: ${relative}`,
              targetFile: relative,
              riskLevel,
              requiresHumanApproval: false,
              requiresGovernedSandbox: reqs.requiresGovernedSandbox || isProtected,
              requiresDryRun: reqs.requiresDryRun,
              requiresBackup: reqs.requiresBackup,
              requiresRollbackProof: reqs.requiresRollbackProof || isProtected,
              sandboxOnly: reqs.sandboxOnly,
            });
            break;
          }
        }

        let content = '';
        try {
          content = fs.readFileSync(full, 'utf8');
        } catch {
          content = '';
        }

        for (const { kind, description } of classifyStructuralDestructiveActions(
          relative,
          content,
        )) {
          if (seen.has(`${kind}:${relative}`)) continue;
          seen.add(`${kind}:${relative}`);
          const reqs = ACTION_KIND_REQUIREMENTS[kind];
          const riskLevel = KIND_RISK_MAP[kind];
          const isProtected = protectedFiles.some(
            (pf) => pf === relative || relative.startsWith(pf + path.sep),
          );

          actions.push({
            actionId: `${kind}:${relative}`,
            kind,
            description: `${description}: ${relative}`,
            targetFile: relative,
            riskLevel,
            requiresHumanApproval: false,
            requiresGovernedSandbox: reqs.requiresGovernedSandbox || isProtected,
            requiresDryRun: reqs.requiresDryRun,
            requiresBackup: reqs.requiresBackup,
            requiresRollbackProof: reqs.requiresRollbackProof || isProtected,
            sandboxOnly: reqs.sandboxOnly,
          });
        }
      }
    }
  }

  walk(rootDir);
  return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Risk Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyRiskLevel(kind: DestructiveActionKind): SandboxRiskLevel {
  return KIND_RISK_MAP[kind];
}

export function isActionAllowedInAutonomy(action: DestructiveAction): boolean {
  if (action.requiresGovernedSandbox) {
    return false;
  }
  if (action.sandboxOnly) {
    return false;
  }
  if (
    action.kind === 'governance_change' ||
    action.kind === 'protected_file_edit' ||
    action.kind === 'secret_access'
  ) {
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Gate Requirements Per Operation Type
// ────────────────────────────────────────────────────────────────────────────

/**
 * Gate level derived from the operation kind's risk profile and requirements.
 *
 * Used by the autonomy loop to decide whether a proposed change can proceed
 * through PULSE-governed validation.
 */
export type GateDecision =
  | 'alllow_autonomous' // No gate required; safe for autonomous execution
  | 'require_sandbox' // Must execute inside a validated sandbox
  | 'block_permanently'; // Operation should never be attempted

function buildGovernedSandboxChecks(action: DestructiveAction): string[] {
  const checks = ['sandbox-created', 'pre-validation', 'patch-validated'];

  if (action.requiresDryRun) {
    checks.push('dry-run');
  }
  if (action.requiresBackup) {
    checks.push('backup-created');
  }
  if (action.requiresRollbackProof) {
    checks.push('rollback-validated');
  }

  checks.push('post-validation');
  return checks;
}

/**
 * Classify the gate requirement for a specific destructive action.
 *
 * This is the central decision function that the autonomy loop calls
 * before applying any change to the repository.
 */
export function classifyGateRequirement(action: DestructiveAction): {
  decision: GateDecision;
  reason: string;
  requiredChecks: string[];
} {
  const risk = action.riskLevel;
  const kind = action.kind;

  if (
    action.kind === 'governance_change' ||
    action.kind === 'protected_file_edit' ||
    action.kind === 'secret_access'
  ) {
    return {
      decision: 'block_permanently',
      reason: `${kind} is outside autonomous execution policy. PULSE records the boundary and blocks execution with policy evidence.`,
      requiredChecks: ['policy-boundary-recorded'],
    };
  }

  // Risk 3 operations always require an isolated sandbox with rollback proof.
  if (risk === 'critical') {
    return {
      decision: 'require_sandbox',
      reason: `Risk 3 (critical) operation: ${kind}. Destructive actions at this level require sandbox isolation, dry-run evidence, backup proof, and rollback proof.`,
      requiredChecks: buildGovernedSandboxChecks(action),
    };
  }

  // Risk 2 operations require sandbox isolation
  if (risk === 'high') {
    return {
      decision: 'require_sandbox',
      reason: `Risk 2 (high) operation: ${kind}. Must be validated in an isolated sandbox before execution.`,
      requiredChecks: buildGovernedSandboxChecks(action),
    };
  }

  // Risk 1 operations are safe in sandbox, can proceed with pre-validation
  if (risk === 'normal') {
    if (action.requiresGovernedSandbox) {
      return {
        decision: 'require_sandbox',
        reason: `Risk 1 (normal) operation flagged for governed validation: ${kind}.`,
        requiredChecks: buildGovernedSandboxChecks(action),
      };
    }
    return {
      decision: 'require_sandbox',
      reason: `Risk 1 (normal) operation: ${kind}. Validating in sandbox.`,
      requiredChecks: ['lint', 'typecheck', 'test'],
    };
  }

  // Risk 0 operations are safe for autonomous execution
  return {
    decision: 'alllow_autonomous',
    reason: `Risk 0 (safe) operation: ${kind}. No gate required.`,
    requiredChecks: [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Patch Validation
// ────────────────────────────────────────────────────────────────────────────

export function validatePatchForProtectedFiles(
  patchFile: string,
  protectedFiles: string[],
): boolean {
  if (!protectedFiles.length) {
    return true;
  }

  if (!pathExists(patchFile)) {
    return false;
  }

  let content: string;
  try {
    content = fs.readFileSync(patchFile, 'utf8');
  } catch {
    return false;
  }

  const modifiedFiles = extractModifiedFilesFromPatch(content);

  for (const file of modifiedFiles) {
    for (const pf of protectedFiles) {
      if (file === pf) {
        return false;
      }
      if (pf.endsWith('/') && file.startsWith(pf)) {
        return false;
      }
      if (file.startsWith(pf + '/')) {
        return false;
      }
    }
  }

  return true;
}

function extractModifiedFilesFromPatch(patch: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const line of patch.split('\n')) {
    if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
      const filePath = line.replace(/^[-+]{3} [ab]\//, '').trim();
      if (filePath && filePath !== '/dev/null' && !seen.has(filePath)) {
        seen.add(filePath);
        files.push(filePath);
      }
    }
  }

  return files;
}

// ────────────────────────────────────────────────────────────────────────────
// Logical Sandbox Workspace (Planning Concept)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a logical sandbox workspace for planning validation.
 *
 * This is NOT an actual git worktree clone. It is a planning concept
 * that records what a workspace would look like for a set of proposed
 * changes, so the autonomy loop can make gating decisions.
 */
export function createLogicalSandbox(params: {
  parentBranch: string;
  filesTouched: string[];
  actionKinds: DestructiveActionKind[];
  rootDir: string;
}): SandboxWorkspace {
  const now = new Date();
  const maxRisk = params.actionKinds.reduce<SandboxRiskLevel>((max, kind) => {
    const risk = KIND_RISK_MAP[kind] ?? 'safe';
    const order: SandboxRiskLevel[] = ['safe', 'normal', 'high', 'critical'];
    return order.indexOf(risk) > order.indexOf(max) ? risk : max;
  }, 'safe' as SandboxRiskLevel);

  // Determine max active minutes from the most restrictive rule
  const maxMinutes = params.actionKinds.reduce((max, kind) => {
    const rules = DEFAULT_ISOLATION_RULES[kind];
    return rules ? Math.max(max, rules.maxActiveMinutes) : max;
  }, 15);

  const expiresAt = new Date(now.getTime() + maxMinutes * 60 * 1000);

  const workspaceId = `sandbox-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspacePath = path.join(params.rootDir, '.pulse', 'sandboxes', workspaceId);

  return {
    workspacePath,
    parentBranch: params.parentBranch,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    filesTouched: params.filesTouched,
    maxRiskLevel: maxRisk,
    patches: [],
    validationResults: [],
    status: 'active',
    allowedActionKinds: params.actionKinds,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Isolation Rules Access
// ────────────────────────────────────────────────────────────────────────────

export function getIsolationRules(kind: DestructiveActionKind): SandboxIsolationRules {
  return DEFAULT_ISOLATION_RULES[kind];
}

export function getAllIsolationRules(): SandboxIsolationRules[] {
  return Object.values(DEFAULT_ISOLATION_RULES);
}

/**
 * Check whether an action kind is compatible with a workspace's isolation
 * rules (i.e., all required preconditions are configured).
 */
export function validateWorkspaceForAction(
  workspace: SandboxWorkspace,
  actionKind: DestructiveActionKind,
): { valid: boolean; missingRules: string[] } {
  const rules = DEFAULT_ISOLATION_RULES[actionKind];
  if (!rules) {
    return { valid: true, missingRules: [] };
  }

  const missing: string[] = [];

  if (rules.requiresSeparateWorktree && !workspace.workspacePath) {
    missing.push('separate_worktree');
  }

  for (const cmd of rules.preValidationCommands) {
    const result = workspace.validationResults.find((r) => r.command === cmd);
    if (!result || !result.passed) {
      missing.push(`pre_validation:${cmd}`);
    }
  }

  return { valid: missing.length === 0, missingRules: missing };
}

// ────────────────────────────────────────────────────────────────────────────
// Sandbox State Construction
// ────────────────────────────────────────────────────────────────────────────

export function buildSandboxState(rootDir: string): SandboxState {
  const protectedFiles = loadProtectedFiles(rootDir);
  const destructiveActions = classifyDestructiveActions(rootDir);

  const governedSandboxActions = destructiveActions.filter((a) => a.requiresGovernedSandbox).length;
  const humanRequiredActions = 0;
  const sandboxOnlyActions = destructiveActions.filter((a) => a.sandboxOnly).length;
  const governanceViolations = destructiveActions.filter(
    (a) => a.kind === 'governance_change' || a.kind === 'protected_file_edit',
  ).length;

  const riskBreakdown: Record<SandboxRiskLevel, number> = {
    safe: destructiveActions.filter((a) => a.riskLevel === 'safe').length,
    normal: destructiveActions.filter((a) => a.riskLevel === 'normal').length,
    high: destructiveActions.filter((a) => a.riskLevel === 'high').length,
    critical: destructiveActions.filter((a) => a.riskLevel === 'critical').length,
  };

  const isolationRules = getAllIsolationRules();

  const state: SandboxState = {
    generatedAt: new Date().toISOString(),
    destructiveActions,
    activeWorkspaces: [],
    protectedFiles,
    isolationRules,
    summary: {
      totalDestructiveActions: destructiveActions.length,
      humanRequiredActions,
      governedSandboxActions,
      sandboxOnlyActions,
      activeWorkspaces: 0,
      riskBreakdown,
      governanceViolations,
    },
  };

  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(state, null, 2));

  return state;
}
