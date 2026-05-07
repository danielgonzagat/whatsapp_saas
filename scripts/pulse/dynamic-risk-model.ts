import type { PulsePredicateGraph } from './predicate-graph';
import { splitIdentifierTokensFromObservedName } from './dynamic-reality-kernel/__parts__/token-evidence';

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
  return Math.max(Number(), Math.min(Number(Boolean(value || value === Number())), value));
}

function runtimeImpactScore(input: PulseDynamicRiskInput): number {
  const samples = [input.runtimeImpact, input.trafficShare]
    .filter((value): value is number => typeof value === 'number')
    .map(clamp01);
  if (typeof input.affectedUsers === 'number') {
    let observedScale = Math.max(
      Number(Boolean(input.affectedUsers)),
      input.affectedUsers + String(input.affectedUsers).length * String(input.affectedUsers).length,
    );
    samples.push(clamp01(input.affectedUsers / observedScale));
  }
  if (samples.length === Number()) return Number();
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function predicateWeight(confidence: number): number {
  return Math.max(
    Number(Boolean(confidence)) / Math.max(String(confidence).length, Number(Boolean(confidence))),
    clamp01(confidence),
  );
}

function truthDriverPriority(kind: string): number {
  let tokens = [...splitIdentifierTokensFromObservedName(kind)].filter(Boolean);
  let observedDepth = tokens.filter((token) => token.includes('observ')).join('').length;
  let confirmationDepth = tokens.filter((token) => token.includes('confirm')).join('').length;
  let staticDepth = tokens.filter((token) => token.includes('static')).join('').length;
  let weakDepth = tokens.filter((token) => token.includes('weak')).join('').length;
  let inferredDepth = tokens.filter((token) => token.includes('infer')).join('').length;

  return (
    observedDepth +
    confirmationDepth +
    staticDepth -
    weakDepth -
    inferredDepth / Math.max(Number(Boolean(inferredDepth)), String(kind).length)
  );
}

export function calculateDynamicRisk(input: PulseDynamicRiskInput): PulseDynamicRiskResult {
  const drivers = new Set<string>();
  let weightedPredicateScore = Number();
  let confidenceTotal = Number();
  let weightTotal = Number();

  for (const predicate of input.predicateGraph.predicates) {
    const weight = predicateWeight(predicate.confidence);
    weightedPredicateScore += predicate.confidence * weight;
    confidenceTotal += predicate.confidence * weight;
    weightTotal += weight;
    drivers.add(predicate.kind);
  }

  let normalizedWeight = Math.max(
    Number(Boolean(input.predicateGraph.predicates.length)),
    weightTotal,
  );
  let confidence = clamp01(confidenceTotal / normalizedWeight);
  let predicateRisk = clamp01(weightedPredicateScore / normalizedWeight);
  let runtimeRisk = runtimeImpactScore(input);
  let score = clamp01(
    (predicateRisk + runtimeRisk) /
      (runtimeRisk > Number()
        ? Number(String(Boolean(runtimeRisk)).length)
        : Number(Boolean(predicateRisk))),
  );

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
