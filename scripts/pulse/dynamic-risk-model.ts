import type { PulsePredicateGraph } from './predicate-graph';

export interface PulseDynamicRiskInput {
  predicateGraph: PulsePredicateGraph;
  runtimeImpact?: number;
  affectedUsers?: number;
  trafficShare?: number;
}

export interface PulseDynamicRiskResult {
  score: number;
  confidence: number;
  drivers: string[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function runtimeImpactScore(input: PulseDynamicRiskInput): number {
  const samples = [input.runtimeImpact, input.trafficShare]
    .filter((value): value is number => typeof value === 'number')
    .map(clamp01);
  if (typeof input.affectedUsers === 'number') {
    samples.push(clamp01(input.affectedUsers / Math.max(1, input.affectedUsers + 100)));
  }
  if (samples.length === 0) return 0;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

export function calculateDynamicRisk(input: PulseDynamicRiskInput): PulseDynamicRiskResult {
  const drivers = new Set<string>();
  let predicateScore = 0;
  let confidenceTotal = 0;

  for (const predicate of input.predicateGraph.predicates) {
    predicateScore += predicate.confidence;
    confidenceTotal += predicate.confidence;
    drivers.add(predicate.kind);
  }

  const predicateCount = Math.max(1, input.predicateGraph.predicates.length);
  const confidence = clamp01(confidenceTotal / predicateCount);
  const predicateRisk = clamp01(predicateScore / predicateCount);
  const runtimeRisk = runtimeImpactScore(input);
  const score = clamp01((predicateRisk + runtimeRisk) / (runtimeRisk > 0 ? 2 : 1));

  return {
    score,
    confidence,
    drivers: [...drivers].sort(),
  };
}
