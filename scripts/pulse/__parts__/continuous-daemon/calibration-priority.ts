import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import type { ProbabilisticRiskArtifact, ProofSynthesisArtifact } from './types-and-constants';
import type { CalibrationSource, CalibrationValue } from './types-and-constants';
import { normalizeCapabilityToken, riskImpactForFile } from './types-and-constants';
import { derived } from './planning';
import { incrementCount, hasEntries, calibrationFloor } from './planning';
import { isAiSafeNode } from './unit-selection';

// ── Evidence deficit helpers ──────────────────────────────────────────────────

export function deriveFileEvidenceDeficits(
  proofSynthesis: ProofSynthesisArtifact | null,
): Record<string, number> {
  let deficits: Record<string, number> = {};
  for (let target of proofSynthesis?.targets ?? []) {
    if (!target.filePath) continue;
    let missingPlans = (target.plans ?? []).filter(
      (plan) => plan.observed !== true && plan.countsAsObserved !== true,
    ).length;
    if (missingPlans > 0) {
      deficits[target.filePath] = (deficits[target.filePath] ?? 0) + missingPlans;
    }
  }
  return deficits;
}

// ── Kind priority ─────────────────────────────────────────────────────────────

export function deriveKindPriority(
  graph: BehaviorGraph,
  proofSynthesis: ProofSynthesisArtifact | null,
): Record<string, CalibrationValue> {
  let counts: Record<string, number> = {};
  for (let target of proofSynthesis?.targets ?? []) {
    let kind = normalizeProofSourceKind(target.sourceKind);
    if (!kind) continue;
    let missingPlans = (target.plans ?? []).filter(
      (plan) => plan.observed !== true && plan.countsAsObserved !== true,
    ).length;
    incrementCount(counts, kind, missingPlans);
  }

  if (hasEntries(counts)) {
    return mapCountsToCalibration(
      counts,
      'evidence_graph',
      'unobserved proof plans by behavior kind',
    );
  }

  for (let node of graph.nodes) {
    incrementCount(counts, node.kind, graph.nodes.length);
  }

  if (hasEntries(counts)) {
    return mapCountsToCalibration(counts, 'artifact', 'behavior graph node distribution');
  }

  return {};
}

// ── Risk priority ─────────────────────────────────────────────────────────────

export function deriveRiskPriority(
  graph: BehaviorGraph,
  risk: ProbabilisticRiskArtifact | null,
): Record<string, CalibrationValue> {
  let counts: Record<string, number> = {};
  for (let node of graph.nodes) {
    if (!isAiSafeNode(node)) continue;
    incrementCount(counts, node.risk, graph.summary.aiSafeNodes || graph.nodes.length);
  }

  if (risk?.summary?.avgReliability !== undefined) {
    let uncertaintyBoost = Math.max(1, Math.round((1 - risk.summary.avgReliability) * 10));
    for (let key of Object.keys(counts)) {
      counts[key] += uncertaintyBoost;
    }
    return mapCountsToCalibration(
      counts,
      'dynamic_risk',
      'ai-safe risk bins boosted by reliability gap',
    );
  }

  if (hasEntries(counts)) {
    return mapCountsToCalibration(counts, 'artifact', 'ai-safe behavior risk distribution');
  }

  return {};
}

// ── Counting helpers ──────────────────────────────────────────────────────────

export function mapCountsToCalibration(
  counts: Record<string, number>,
  source: CalibrationSource,
  detail: string,
): Record<string, CalibrationValue> {
  let values = Object.values(counts);
  let max = Math.max(...values, calibrationFloor(values.length));
  let result: Record<string, CalibrationValue> = {};
  for (let [key, count] of Object.entries(counts)) {
    result[key] = derived(
      Math.max(calibrationFloor(count), Math.round((count / max) * Math.max(...values))),
      source,
      detail,
    );
  }
  return result;
}

export function normalizeProofSourceKind(sourceKind: string | undefined): string | null {
  switch (sourceKind) {
    case 'endpoint':
      return 'api_endpoint';
    case 'pure_function':
      return 'function_definition';
    case 'worker':
      return 'queue_consumer';
    case 'webhook':
      return 'webhook_receiver';
    case 'state_mutation':
      return 'db_writer';
    case 'ui_action':
      return 'ui_action';
    default:
      return sourceKind ?? null;
  }
}

// ── File risk impact ──────────────────────────────────────────────────────────

export function deriveFileRiskImpact(
  risk: ProbabilisticRiskArtifact | null,
): Record<string, number> {
  let impacts: Record<string, number> = {};
  let reliabilities = risk?.reliabilities ?? [];
  let maxImpact = Math.max(
    ...reliabilities.map((entry) => entry.expectedImpact ?? Number()),
    Number(),
  );
  if (!maxImpact) return impacts;

  for (let entry of reliabilities) {
    let id = entry.capabilityId ?? entry.capabilityName;
    let expectedImpact = entry.expectedImpact ?? Number();
    if (!id || !expectedImpact) continue;
    impacts[normalizeCapabilityToken(id)] = Math.round(
      (expectedImpact / maxImpact) *
        Math.max(
          ...reliabilities.map((item) => item.observations ?? Number()),
          calibrationFloor(reliabilities.length),
        ),
    );
  }
  return impacts;
}
