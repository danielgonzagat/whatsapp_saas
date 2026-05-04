import type {
  DestructiveAction,
  DestructiveActionKind,
  SandboxRiskLevel,
} from '../../types.safety-sandbox';

import { deriveRiskLevelFromEffectGraph } from './risk-classification';

export type GateDecision = 'alllow_autonomous' | 'require_sandbox' | 'block_permanently';

export function classifyRiskLevel(kind: DestructiveActionKind): SandboxRiskLevel {
  return deriveRiskLevelFromEffectGraph(kind, null);
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

function isAutonomousPolicyBoundary(action: DestructiveAction): boolean {
  return action.requiresGovernedSandbox && !action.requiresDryRun && !action.sandboxOnly;
}

export function classifyGateRequirement(action: DestructiveAction): {
  decision: GateDecision;
  reason: string;
  requiredChecks: string[];
} {
  const kind = action.kind;

  if (isAutonomousPolicyBoundary(action)) {
    return {
      decision: 'block_permanently',
      reason: `${kind} is outside autonomous execution policy. PULSE records the boundary and blocks execution with policy evidence.`,
      requiredChecks: ['policy-boundary-recorded'],
    };
  }

  if (action.requiresGovernedSandbox || action.sandboxOnly) {
    return {
      decision: 'require_sandbox',
      reason: `${kind} requires governed sandbox validation from its patch effects, blast radius, and proof needs.`,
      requiredChecks: buildGovernedSandboxChecks(action),
    };
  }

  return {
    decision: 'alllow_autonomous',
    reason: `${kind} has no sandbox-only, dry-run, backup, rollback, or boundary proof requirement.`,
    requiredChecks: [],
  };
}
