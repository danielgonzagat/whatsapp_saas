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

function predicateWeight(confidence: number): number {
  return Math.max(0.1, clamp01(confidence));
}

function truthDriverPriority(kind: string): number {
  if (kind === 'truth_observed') return 4;
  if (kind === 'truth_confirmed_static') return 3;
  if (kind === 'truth_inferred') return 2;
  if (kind === 'truth_weak_signal') return 1;
  return 0;
}

export function calculateDynamicRisk(input: PulseDynamicRiskInput): PulseDynamicRiskResult {
  const drivers = new Set<string>();
  let weightedPredicateScore = 0;
  let confidenceTotal = 0;
  let weightTotal = 0;

  for (const predicate of input.predicateGraph.predicates) {
    const weight = predicateWeight(predicate.confidence);
    weightedPredicateScore += predicate.confidence * weight;
    confidenceTotal += predicate.confidence * weight;
    weightTotal += weight;
    drivers.add(predicate.kind);
  }

  const normalizedWeight = Math.max(1, weightTotal);
  const confidence = clamp01(confidenceTotal / normalizedWeight);
  const predicateRisk = clamp01(weightedPredicateScore / normalizedWeight);
  const runtimeRisk = runtimeImpactScore(input);
  const score = clamp01((predicateRisk + runtimeRisk) / (runtimeRisk > 0 ? 2 : 1));

  return {
    score,
    confidence,
    drivers: [...drivers].sort((left, right) => {
      const truthDelta = truthDriverPriority(right) - truthDriverPriority(left);
      if (truthDelta !== 0) return truthDelta;
      const leftPredicate = input.predicateGraph.predicates.find((item) => item.kind === left);
      const rightPredicate = input.predicateGraph.predicates.find((item) => item.kind === right);
      const confidenceDelta = (rightPredicate?.confidence ?? 0) - (leftPredicate?.confidence ?? 0);
      return confidenceDelta !== 0 ? confidenceDelta : left.localeCompare(right);
    }),
  };
}
