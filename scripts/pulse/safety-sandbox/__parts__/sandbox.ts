// PULSE — Safety Sandbox Workspace & Isolation Rules
// Part: sandbox — logical sandbox workspace, isolation rules, sandbox state construction

import * as path from 'path';

import type { PulseCommandPurpose } from '../../command-graph/__parts__/types';
import { buildPulseCommandGraph } from '../../command-graph/__parts__/env-and-build';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import { discoverConvergenceEvidenceConfidenceLabels } from '../../__kernel_additions__/discoverConvergenceEvidenceConfidenceLabels';
import { ensureDir, writeTextFile } from '../../safe-fs';
import type {
  DestructiveActionKind,
  SandboxIsolationRules,
  SandboxState,
  SandboxWorkspace,
} from '../../types.safety-sandbox';
import {
  _z,
  _riskAtOrdinal,
  buildEmptyEffectGraph,
  deriveRequirementsFromEffectGraph,
  deriveRiskLevelFromEffectGraph,
  getRiskOrder,
  getActionKindGrammar,
} from './effect-graph';
import { loadProtectedFiles } from './protected-files';
import { classifyDestructiveActions } from './classification';

// ────────────────────────────────────────────────────────────────────────────
// Sandbox Workspace Helpers
// ────────────────────────────────────────────────────────────────────────────

function getDefaultLogicalSandboxMinutes(): number {
  const len = getRiskOrder().length;
  return len * len;
}

function commandsByPurpose(rootDir: string, purposes: PulseCommandPurpose[]): string[] {
  try {
    const purposeSet = new Set<PulseCommandPurpose>(purposes);
    return buildPulseCommandGraph(rootDir)
      .commands.filter((command) => purposeSet.has(command.purpose))
      .sort((left, right) => {
        const confidenceOrder = [...discoverConvergenceEvidenceConfidenceLabels()];
        const byConfidence =
          confidenceOrder.indexOf(left.confidence) - confidenceOrder.indexOf(right.confidence);
        return byConfidence === 0 ? left.command.localeCompare(right.command) : byConfidence;
      })
      .map((command) => command.command);
  } catch {
    return [];
  }
}

function deriveBlockedPaths(
  rootDir: string | null,
  graph: ReturnType<typeof buildEmptyEffectGraph>,
): string[] {
  if (!rootDir) {
    return [];
  }

  const blocked = new Set<string>();

  if (graph.protectedByGovernance || graph.fileEffects.has('governance_surface')) {
    for (const protectedFile of loadProtectedFiles(rootDir)) {
      blocked.add(protectedFile.replace(/\\/g, '/').replace(/^\.\//, ''));
    }
  }

  if (graph.fileEffects.has('secret_surface') || graph.patchEffects.has('secret_evidence')) {
    try {
      for (const environmentVariable of buildPulseCommandGraph(rootDir).environmentVariables) {
        if (environmentVariable.secretLike) {
          blocked.add(environmentVariable.sourcePath.replace(/\\/g, '/').replace(/^\.\//, ''));
        }
      }
    } catch {
      return [...blocked].sort();
    }
  }

  return [...blocked].sort();
}

function deriveValidationPurposes(graph: ReturnType<typeof buildEmptyEffectGraph>): {
  pre: PulseCommandPurpose[];
  post: PulseCommandPurpose[];
} {
  const pre = new Set<PulseCommandPurpose>();
  const post = new Set<PulseCommandPurpose>();

  if (!graph.fileEffects.has('secret_surface')) {
    pre.add('lint');
    pre.add('typecheck');
  }
  if (!graph.protectedByGovernance && !graph.fileEffects.has('secret_surface')) {
    post.add('test');
  }
  if (graph.fileEffects.has('infra_surface')) {
    post.add('build');
  }

  return { pre: [...pre], post: [...post] };
}

function deriveMaxActiveMinutes(input: {
  riskLevel: ReturnType<typeof deriveRiskLevelFromEffectGraph>;
  requirements: ReturnType<typeof deriveRequirementsFromEffectGraph>;
  preValidationCommands: string[];
  postValidationCommands: string[];
}): number {
  const riskWeight = getRiskOrder().indexOf(input.riskLevel) + getRiskOrder().length;
  const proofSteps = [
    input.requirements.requiresDryRun,
    input.requirements.requiresBackup,
    input.requirements.requiresRollbackProof,
    input.requirements.sandboxOnly,
  ].filter(Boolean).length;
  const validationSteps = input.preValidationCommands.length + input.postValidationCommands.length;

  return getDefaultLogicalSandboxMinutes() * (riskWeight + proofSteps + validationSteps);
}

function deriveIsolationRules(
  kind: DestructiveActionKind,
  rootDir: string | null,
): SandboxIsolationRules {
  const graph = buildEmptyEffectGraph(kind);
  const riskLevel = deriveRiskLevelFromEffectGraph(kind, graph);
  const requirements = deriveRequirementsFromEffectGraph(kind, graph);
  const purposes = deriveValidationPurposes(graph);
  const preValidationCommands = rootDir ? commandsByPurpose(rootDir, purposes.pre) : [];
  const postValidationCommands = rootDir ? commandsByPurpose(rootDir, purposes.post) : [];

  return {
    kind,
    requiresSeparateWorktree: requirements.requiresGovernedSandbox || requirements.sandboxOnly,
    requiresNetworkIsolation:
      graph.patchEffects.has('external_mutation') || graph.fileEffects.has('secret_surface'),
    requiresDatabaseIsolation:
      graph.fileEffects.has('migration_surface') ||
      graph.patchEffects.has('persistent_delete') ||
      graph.patchEffects.has('destructive_sql') ||
      graph.patchEffects.has('external_mutation'),
    blockedPaths: deriveBlockedPaths(rootDir, graph),
    preValidationCommands,
    postValidationCommands,
    maxActiveMinutes: deriveMaxActiveMinutes({
      riskLevel,
      requirements,
      preValidationCommands,
      postValidationCommands,
    }),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Logical Sandbox Workspace
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
  const maxRisk = params.actionKinds.reduce<ReturnType<typeof _riskAtOrdinal>>((max, kind) => {
    const risk = deriveRiskLevelFromEffectGraph(kind, null);
    return getRiskOrder().indexOf(risk) > getRiskOrder().indexOf(max) ? risk : max;
  }, _riskAtOrdinal(_z));

  const maxMinutes = params.actionKinds.reduce((max, kind) => {
    const rules = deriveIsolationRules(kind, params.rootDir);
    return Math.max(max, rules.maxActiveMinutes);
  }, getDefaultLogicalSandboxMinutes());

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
// Public Isolation Rules API
// ────────────────────────────────────────────────────────────────────────────

export function getIsolationRules(
  kind: DestructiveActionKind,
  rootDir: string | null = null,
): SandboxIsolationRules {
  return deriveIsolationRules(kind, rootDir);
}

export function getAllIsolationRules(rootDir: string | null = null): SandboxIsolationRules[] {
  return getActionKindGrammar().map((kind) => deriveIsolationRules(kind, rootDir));
}

/**
 * Check whether an action kind is compatible with a workspace's isolation
 * rules (i.e., all required preconditions are configured).
 */
export function validateWorkspaceForAction(
  workspace: SandboxWorkspace,
  actionKind: DestructiveActionKind,
): { valid: boolean; missingRules: string[] } {
  const rules = deriveIsolationRules(actionKind, null);

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
    (a) => a.kind.includes('governance') || a.kind.includes('protected'),
  ).length;

  const riskBreakdown = getRiskOrder().reduce(
    (breakdown, level) => ({
      ...breakdown,
      [level]: destructiveActions.filter((a) => a.riskLevel === level).length,
    }),
    {} as Record<ReturnType<typeof getRiskOrder>[number], number>,
  );

  const isolationRules = getAllIsolationRules(rootDir);

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
  writeTextFile(
    path.join(
      pulseDir,
      discoverAllObservedArtifactFilenames().sandboxState || 'PULSE_SANDBOX_STATE.json',
    ),
    JSON.stringify(state, null, 2),
  );

  return state;
}
