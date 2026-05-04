import type { DestructiveActionKind, SandboxRiskLevel } from '../../types.safety-sandbox';

import {
  type ActionSafetyRequirements,
  type FileEffectGraph,
  hasPatchEffects,
  maxRisk,
} from './effect-graph';

export function buildEmptyEffectGraph(kind: DestructiveActionKind): FileEffectGraph {
  const graph: FileEffectGraph = {
    relativePath: kind,
    protectedByGovernance: false,
    fileEffects: new Set(),
    patchEffects: new Set(),
    reversible: !kind.includes('delete'),
    rollbackAvailable: false,
    backupAvailable: false,
  };

  const effectName = kind.replace(/_change$|_edit$|_access$|_operation$|_mutation$/u, '');

  if (effectName.includes('migration')) {
    graph.fileEffects.add('migration_surface');
  }
  if (effectName.includes('infra')) {
    graph.fileEffects.add('infra_surface');
  }
  if (effectName.includes('secret')) {
    graph.fileEffects.add('secret_surface');
  }
  if (effectName.includes('governance') || effectName.includes('protected')) {
    graph.fileEffects.add('governance_surface');
    graph.protectedByGovernance = true;
  }
  if (effectName.includes('access')) {
    graph.fileEffects.add('access_boundary_surface');
  }
  if (kind.includes('external')) {
    graph.patchEffects.add('external_mutation');
  }
  if (kind.includes('delete')) {
    graph.patchEffects.add('persistent_delete');
  }

  return graph;
}

export function deriveRiskLevelFromEffectGraph(
  kind: DestructiveActionKind,
  graph: FileEffectGraph | null,
): SandboxRiskLevel {
  if (!graph) {
    return deriveRiskLevelFromEffectGraph(kind, buildEmptyEffectGraph(kind));
  }

  let risk: SandboxRiskLevel = graph.fileEffects.has('test_surface') ? 'safe' : 'normal';
  if (graph.fileEffects.has('documentation_surface') && !hasPatchEffects(graph)) {
    risk = 'safe';
  }
  if (
    graph.fileEffects.has('infra_surface') ||
    graph.fileEffects.has('access_boundary_surface') ||
    graph.patchEffects.has('access_boundary_change') ||
    graph.patchEffects.has('external_mutation')
  ) {
    risk = maxRisk(risk, 'high');
  }
  if (
    graph.protectedByGovernance ||
    graph.fileEffects.has('governance_surface') ||
    graph.fileEffects.has('secret_surface') ||
    graph.patchEffects.has('secret_evidence') ||
    (graph.patchEffects.has('destructive_sql') && !graph.rollbackAvailable) ||
    (!graph.reversible && !graph.rollbackAvailable)
  ) {
    risk = maxRisk(risk, 'critical');
  }
  if (graph.fileEffects.has('migration_surface') && graph.reversible && graph.rollbackAvailable) {
    risk = maxRisk(risk, 'high');
  }

  return risk;
}

export function deriveRequirementsFromEffectGraph(
  kind: DestructiveActionKind,
  graph: FileEffectGraph,
): ActionSafetyRequirements {
  const riskLevel = deriveRiskLevelFromEffectGraph(kind, graph);
  const irreversible = !graph.reversible;
  const persistentOrExternal =
    graph.patchEffects.has('persistent_delete') ||
    graph.patchEffects.has('destructive_sql') ||
    graph.patchEffects.has('external_mutation') ||
    graph.fileEffects.has('migration_surface');
  const boundary =
    graph.protectedByGovernance ||
    graph.fileEffects.has('governance_surface') ||
    graph.fileEffects.has('secret_surface') ||
    graph.patchEffects.has('secret_evidence');

  return {
    requiresGovernedSandbox:
      riskLevel !== 'safe' || boundary || persistentOrExternal || hasPatchEffects(graph),
    requiresDryRun:
      !boundary && (persistentOrExternal || riskLevel === 'high' || hasPatchEffects(graph)),
    requiresBackup: irreversible || graph.fileEffects.has('migration_surface') || boundary,
    requiresRollbackProof:
      irreversible || persistentOrExternal || boundary || riskLevel === 'critical',
    sandboxOnly:
      !boundary &&
      (riskLevel === 'high' || graph.patchEffects.has('external_mutation') || persistentOrExternal),
  };
}
