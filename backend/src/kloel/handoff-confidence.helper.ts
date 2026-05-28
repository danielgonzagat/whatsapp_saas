import type { AbiBelief, AbiPulseTruth } from './abi/abi-schema';

/**
 * Phase-1 confidence collector for the WAVE4_HANDOFF_DESIGN proposal:
 * compute the composite confidence score for an ABI cognitive state.
 *
 * The composite is the same formula the future confidence-based handoff
 * gate will use:
 *
 *   composite = 0.5 * meanBeliefConfidence
 *             + 0.35 * capabilityHealth
 *             + 0.15 * (1 - overclaimRisk)
 *
 * Phase 1 is OBSERVE-ONLY: callers compute the score, log it for telemetry
 * baselining, but do NOT yet escalate or gate. Phase 2 will flag-gate the
 * gate; Phase 3 will default-on after N successful handoff events with
 * accepted composite thresholds.
 *
 * Rationale:
 *  - meanBeliefConfidence: primary cognitive truth signal (avg confidence
 *    across beliefs that ABI synthesized this turn)
 *  - capabilityHealth: operational reality from PulseTruth (a system in
 *    degraded health should hand off more eagerly)
 *  - overclaimRisk: 1 = max risk, penalizes fabrication-prone states
 */
export interface HandoffConfidenceSnapshot {
  composite: number;
  meanBeliefConfidence: number;
  capabilityHealth: number;
  overclaimRisk: number;
  beliefCount: number;
  // Phase 1: report only; Phase 2 will gate on this.
  wouldEscalateAtThreshold04: boolean;
}

export const HANDOFF_THRESHOLD = 0.4;

export function computeHandoffConfidence(
  beliefs: readonly AbiBelief[] | undefined,
  pulseTruth: AbiPulseTruth | undefined,
): HandoffConfidenceSnapshot {
  const beliefArr = beliefs ?? [];
  const meanBeliefConfidence =
    beliefArr.length > 0
      ? beliefArr.reduce((sum, b) => sum + (Number.isFinite(b.confidence) ? b.confidence : 0), 0) /
        beliefArr.length
      : 0;
  const capabilityHealth = Number.isFinite(pulseTruth?.capabilityHealthScore)
    ? Number(pulseTruth?.capabilityHealthScore)
    : 0;
  const overclaimRiskRaw = Number.isFinite(pulseTruth?.overclaimRisk)
    ? Number(pulseTruth?.overclaimRisk)
    : 0;
  const overclaimRisk = Math.min(1, Math.max(0, overclaimRiskRaw));
  const composite =
    0.5 * meanBeliefConfidence + 0.35 * capabilityHealth + 0.15 * (1 - overclaimRisk);
  return {
    composite,
    meanBeliefConfidence,
    capabilityHealth,
    overclaimRisk,
    beliefCount: beliefArr.length,
    wouldEscalateAtThreshold04: composite < HANDOFF_THRESHOLD,
  };
}
