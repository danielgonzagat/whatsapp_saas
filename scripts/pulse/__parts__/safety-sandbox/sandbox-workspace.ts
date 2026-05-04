import * as path from 'path';

import type { PulseCommandPurpose } from '../../command-graph';
import type {
  DestructiveActionKind,
  SandboxIsolationRules,
  SandboxRiskLevel,
  SandboxWorkspace,
} from '../../types.safety-sandbox';

import { buildPulseCommandGraph } from '../../command-graph';
import {
  type ActionSafetyRequirements,
  type FileEffectGraph,
  ACTION_KIND_GRAMMAR,
  DEFAULT_LOGICAL_SANDBOX_MINUTES,
  RISK_ORDER,
  normalizeRepoPath,
} from './effect-graph';
import {
  buildEmptyEffectGraph,
  deriveRequirementsFromEffectGraph,
  deriveRiskLevelFromEffectGraph,
} from './risk-classification';
import { loadProtectedFiles } from './protected-files';

export function createLogicalSandbox(params: {
  parentBranch: string;
  filesTouched: string[];
  actionKinds: DestructiveActionKind[];
  rootDir: string;
}): SandboxWorkspace {
  const now = new Date();
  const maxRisk = params.actionKinds.reduce<SandboxRiskLevel>((max, kind) => {
    const risk = deriveRiskLevelFromEffectGraph(kind, null);
    return RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(max) ? risk : max;
  }, 'safe' as SandboxRiskLevel);

  const maxMinutes = params.actionKinds.reduce((max, kind) => {
    const rules = deriveIsolationRules(kind, params.rootDir);
    return Math.max(max, rules.maxActiveMinutes);
  }, DEFAULT_LOGICAL_SANDBOX_MINUTES);

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

function commandsByPurpose(rootDir: string, purposes: PulseCommandPurpose[]): string[] {
  try {
    const purposeSet = new Set<PulseCommandPurpose>(purposes);
    return buildPulseCommandGraph(rootDir)
      .commands.filter((command) => purposeSet.has(command.purpose))
      .sort((left, right) => {
        const byConfidence =
          ['high', 'medium', 'low'].indexOf(left.confidence) -
          ['high', 'medium', 'low'].indexOf(right.confidence);
        return byConfidence === 0 ? left.command.localeCompare(right.command) : byConfidence;
      })
      .map((command) => command.command);
  } catch {
    return [];
  }
}

function deriveBlockedPaths(rootDir: string | null, graph: FileEffectGraph): string[] {
  if (!rootDir) {
    return [];
  }

  const blocked = new Set<string>();

  if (graph.protectedByGovernance || graph.fileEffects.has('governance_surface')) {
    for (const protectedFile of loadProtectedFiles(rootDir)) {
      blocked.add(normalizeRepoPath(protectedFile));
    }
  }

  if (graph.fileEffects.has('secret_surface') || graph.patchEffects.has('secret_evidence')) {
    try {
      for (const environmentVariable of buildPulseCommandGraph(rootDir).environmentVariables) {
        if (environmentVariable.secretLike) {
          blocked.add(normalizeRepoPath(environmentVariable.sourcePath));
        }
      }
    } catch {
      return [...blocked].sort();
    }
  }

  return [...blocked].sort();
}

function deriveValidationPurposes(graph: FileEffectGraph): {
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
  riskLevel: SandboxRiskLevel;
  requirements: ActionSafetyRequirements;
  preValidationCommands: string[];
  postValidationCommands: string[];
}): number {
  const riskWeight = RISK_ORDER.indexOf(input.riskLevel) + RISK_ORDER.length;
  const proofSteps = [
    input.requirements.requiresDryRun,
    input.requirements.requiresBackup,
    input.requirements.requiresRollbackProof,
    input.requirements.sandboxOnly,
  ].filter(Boolean).length;
  const validationSteps = input.preValidationCommands.length + input.postValidationCommands.length;

  return DEFAULT_LOGICAL_SANDBOX_MINUTES * (riskWeight + proofSteps + validationSteps);
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

export function getIsolationRules(
  kind: DestructiveActionKind,
  rootDir: string | null = null,
): SandboxIsolationRules {
  return deriveIsolationRules(kind, rootDir);
}

export function getAllIsolationRules(rootDir: string | null = null): SandboxIsolationRules[] {
  return ACTION_KIND_GRAMMAR.map((kind) => deriveIsolationRules(kind, rootDir));
}

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
