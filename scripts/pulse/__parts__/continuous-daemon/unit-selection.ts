import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import type { DaemonCalibrationSnapshot } from './types-and-constants';
import { riskImpactForFile } from './types-and-constants';

// ── Unit selection ────────────────────────────────────────────────────────────

export function isAiSafeNode(
  node: BehaviorNode,
): node is BehaviorNode & { executionMode: 'ai_safe' } {
  return node.executionMode === 'ai_safe';
}

export type { PlannedUnit } from './types-and-constants';

/**
 * Pick the highest-value ai_safe unit from the behavior graph.
 *
 * Priority scoring:
 *   - kind priority is derived from unobserved proof/evidence graph gaps
 *   - risk priority is derived from behavior graph risk distribution and dynamic risk
 *   - prefers units with observability (hasLogging, hasMetrics, hasTracing)
 *   - excludes recently planned units (cooldown)
 *
 * @param graph       The behavior graph containing all nodes.
 * @param recentUnits Set of unit IDs from recent cycles to exclude.
 * @param calibration Dynamic daemon calibration loaded from PULSE artifacts/history.
 * @returns The selected unit with a strategy description, or null.
 */
export function pickNextUnit(
  graph: BehaviorGraph,
  recentUnits: Set<string>,
  calibration: DaemonCalibrationSnapshot,
): PlannedUnit | null {
  let aiSafeNodes = graph.nodes.filter(
    (n): n is BehaviorNode & { executionMode: 'ai_safe' } => n.executionMode === 'ai_safe',
  );

  if (!aiSafeNodes.length) return null;

  let eligible = aiSafeNodes.filter((n) => !recentUnits.has(n.id));

  if (!eligible.length) {
    let allEligible = aiSafeNodes;
    let scored = allEligible.map((node) => ({
      node,
      score: scoreNodePriority(node, calibration),
    }));
    scored.sort((a, b) => b.score - a.score);
    let best = scored[0];
    if (!best) return null;
    return buildPlannedUnit(best.node, best.score, calibration);
  }

  let scored = eligible.map((node) => ({
    node,
    score: scoreNodePriority(node, calibration),
  }));

  scored.sort((a, b) => b.score - a.score);
  let best = scored[0];
  if (!best) return null;
  return buildPlannedUnit(best.node, best.score, calibration);
}

export function scoreNodePriority(
  node: BehaviorNode,
  calibration: DaemonCalibrationSnapshot,
): number {
  return (
    (calibration.kindPriority[node.kind]?.value ?? Number()) +
    (calibration.riskPriority[node.risk]?.value ?? Number()) +
    (calibration.fileEvidenceDeficits[node.filePath] ?? Number()) +
    riskImpactForFile(node.filePath, calibration.fileRiskImpact) +
    (node.hasLogging ? 1 : 0) +
    (node.hasMetrics ? 1 : 0) +
    (node.hasTracing ? 1 : 0)
  );
}

export function buildPlannedUnit(
  node: BehaviorNode,
  priority: number,
  calibration: DaemonCalibrationSnapshot,
): PlannedUnit {
  let strategyParts: string[] = [];

  if (node.hasErrorHandler) {
    strategyParts.push('unit already has error handler — validate coverage');
  } else {
    strategyParts.push('add try/catch error boundary');
  }

  if (!node.hasLogging) strategyParts.push('add structured logging');
  if (!node.hasMetrics) strategyParts.push('add metrics instrumentation');
  if (!node.hasTracing) strategyParts.push('add tracing span');
  if ((calibration.fileEvidenceDeficits[node.filePath] ?? 0) > 0) {
    strategyParts.push('close unobserved proof plans from evidence graph');
  }
  if (riskImpactForFile(node.filePath, calibration.fileRiskImpact) > 0) {
    strategyParts.push('prioritize dynamic-risk capability impact');
  }

  let strategy =
    strategyParts.length > 0
      ? strategyParts.join('; ')
      : `validate unit ${node.name} idempotency and error paths`;

  return {
    unitId: node.id,
    filePath: node.filePath,
    name: node.name,
    kind: node.kind,
    risk: node.risk,
    priority,
    prioritySource: [
      calibration.kindPriority[node.kind]?.source ?? String(calibration.kindPriority[node.kind]),
      calibration.riskPriority[node.risk]?.source ?? String(calibration.riskPriority[node.risk]),
    ].join('+'),
    strategy,
  };
}
