/**
 * UTP-DELEG-006 — Delegation Evidence Builder.
 *
 * Packages evidence bundles from area delegation state for human-auditable
 * delegation decisions. Computes R17 score (delegation confidence metric).
 *
 * Pure function — stateless evidence packaging from delegation state.
 */

import { randomUUID } from 'node:crypto';
import type { AreaDelegationState, DelegationEvidence } from './delegation.types';

const R17_GATE_WEIGHT = 0.4;
const R17_ERROR_WEIGHT = 0.3;
const R17_TRUST_WEIGHT = 0.3;
const R17_CONSECUTIVE_BONUS = 0.15;

export interface EvidenceInput {
  readonly state: AreaDelegationState;
  readonly gatePassCount: number;
  readonly gateFailCount: number;
  readonly errorCount: number;
  readonly eventsAnalyzed: number;
  readonly trustScore: number;
  readonly consecutiveCyclesOk: number;
  readonly nowMs: number;
}

/**
 * Compute the R17 score — the core delegation confidence metric from B0.2.
 *
 * R17 = gatePassRate * R17_GATE_WEIGHT
 *     + (1 - errorRate) * R17_ERROR_WEIGHT
 *     + trustScore * R17_TRUST_WEIGHT
 *     + consecutiveBonus
 */
function computeR17Score(
  gatePassRate: number,
  errorRate: number,
  trustScore: number,
  consecutiveCyclesOk: number,
): number {
  const gateContribution = gatePassRate * R17_GATE_WEIGHT;
  const errorContribution = (1 - Math.min(errorRate, 1)) * R17_ERROR_WEIGHT;
  const trustContribution = trustScore * R17_TRUST_WEIGHT;

  const consecutiveBonus = Math.min(
    (consecutiveCyclesOk / 10) * R17_CONSECUTIVE_BONUS,
    R17_CONSECUTIVE_BONUS,
  );

  const rawScore = gateContribution + errorContribution + trustContribution + consecutiveBonus;

  return Math.round(Math.min(rawScore, 1) * 100) / 100;
}

function computeRecommendationConfidence(
  gatePassRate: number,
  errorRate: number,
  trustScore: number,
  eventsAnalyzed: number,
): number {
  const baseConfidence = gatePassRate * 0.4 + (1 - errorRate) * 0.3 + trustScore * 0.3;

  const evidencePenalty =
    eventsAnalyzed >= 100 ? 1 : eventsAnalyzed >= 50 ? 0.9 : eventsAnalyzed >= 10 ? 0.7 : 0.5;

  return Math.round(baseConfidence * evidencePenalty * 100) / 100;
}

/**
 * Build an evidence bundle for delegation decisions.
 */
export function buildDelegationEvidence(input: EvidenceInput): DelegationEvidence {
  const totalGates = input.gatePassCount + input.gateFailCount;
  const gatePassRate = totalGates > 0 ? input.gatePassCount / totalGates : 1;

  const errorRate = input.eventsAnalyzed > 0 ? input.errorCount / input.eventsAnalyzed : 0;

  const r17Score = computeR17Score(
    gatePassRate,
    errorRate,
    input.trustScore,
    input.consecutiveCyclesOk,
  );

  const recommendationConfidence = computeRecommendationConfidence(
    gatePassRate,
    errorRate,
    input.trustScore,
    input.eventsAnalyzed,
  );

  return {
    evidenceId: `evd_${randomUUID()}`,
    area: input.state.area,
    workspaceId: input.state.workspaceId,
    eventsAnalyzed: input.eventsAnalyzed,
    gatePassCount: input.gatePassCount,
    gateFailCount: input.gateFailCount,
    errorCount: input.errorCount,
    consecutiveCyclesOk: input.consecutiveCyclesOk,
    trustScore: Math.round(input.trustScore * 100) / 100,
    recommendationConfidence,
    r17Score,
    generatedAt: new Date(input.nowMs).toISOString(),
  };
}
