/**
 * UTP-DELEG-002 — Graduation Detector.
 *
 * Analyzes delegation state to determine whether an operational area
 * is ready for higher autonomy. Considers confidence score, error rate,
 * gate pass rate, consecutive cycles at current level, and cooldown
 * windows.
 *
 * Pure function — stateless verdict generation from delegation state.
 */

import type { AreaDelegationState, DelegationLevel, GraduationVerdict } from './delegation.types';
import {
  DELEGATION_DEMOTION_THRESHOLD,
  DELEGATION_GRADUATION_THRESHOLD,
  DELEGATION_MIN_CYCLES_FOR_GRADUATION,
  DELEGATION_MIN_EVIDENCE_FOR_GRADUATION,
  nextDelegationLevel,
  previousDelegationLevel,
} from './delegation.types';

export interface GraduationContext {
  readonly state: AreaDelegationState;
  readonly cooldownActive: boolean;
  readonly nowMs: number;
}

function buildReasons(state: AreaDelegationState, verdict: GraduationVerdict['verdict']): string[] {
  const reasons: string[] = [];

  if (verdict === 'promote') {
    reasons.push(
      `confidenceScore ${state.confidenceScore} >= threshold ${DELEGATION_GRADUATION_THRESHOLD}`,
    );
    reasons.push(
      `cyclesAtCurrentLevel ${state.cyclesAtCurrentLevel} >= min ${DELEGATION_MIN_CYCLES_FOR_GRADUATION}`,
    );
    reasons.push(
      `evidenceCount ${state.evidenceCount} >= min ${DELEGATION_MIN_EVIDENCE_FOR_GRADUATION}`,
    );
    reasons.push(`gatePassRate ${state.gatePassRate} at sustainable level`);
    reasons.push(`errorRate ${state.errorRate} within acceptable range`);
  } else if (verdict === 'demote') {
    if (state.confidenceScore < DELEGATION_DEMOTION_THRESHOLD) {
      reasons.push(
        `confidenceScore ${state.confidenceScore} below demotion threshold ${DELEGATION_DEMOTION_THRESHOLD}`,
      );
    }
    if (state.errorRate >= 0.3) {
      reasons.push(`errorRate ${state.errorRate} exceeds acceptable limit`);
    }
    if (state.gatePassRate < 0.5) {
      reasons.push(`gatePassRate ${state.gatePassRate} below minimum`);
    }
  } else {
    if (state.confidenceScore < DELEGATION_GRADUATION_THRESHOLD) {
      reasons.push(`confidenceScore ${state.confidenceScore} below graduation threshold`);
    }
    if (state.cyclesAtCurrentLevel < DELEGATION_MIN_CYCLES_FOR_GRADUATION) {
      reasons.push(`cyclesAtCurrentLevel ${state.cyclesAtCurrentLevel} below min cycles`);
    }
    if (state.evidenceCount < DELEGATION_MIN_EVIDENCE_FOR_GRADUATION) {
      reasons.push(`evidenceCount ${state.evidenceCount} below min evidence`);
    }
    if (reasons.length === 0) {
      reasons.push('area requires further observation before graduation');
    }
  }

  return reasons;
}

function computeSuggestedLevel(
  state: AreaDelegationState,
  verdict: GraduationVerdict['verdict'],
): DelegationLevel {
  if (verdict === 'promote') {
    return nextDelegationLevel(state.currentLevel);
  }
  if (verdict === 'demote') {
    return previousDelegationLevel(state.currentLevel);
  }
  return state.currentLevel;
}

function computeConfidence(
  state: AreaDelegationState,
  verdict: GraduationVerdict['verdict'],
): number {
  if (verdict === 'promote') {
    return Math.min(1, state.confidenceScore + 0.05);
  }
  if (verdict === 'demote') {
    return Math.max(0, state.confidenceScore - 0.15);
  }
  return state.confidenceScore;
}

/**
 * Detect graduation readiness for a single area.
 *
 * Evaluates delegation state against thresholds and returns a verdict
 * of promote, hold, or demote with reasons and confidence.
 */
export function detectGraduation(ctx: GraduationContext): GraduationVerdict {
  const { state, cooldownActive } = ctx;

  const demotionTriggers =
    state.confidenceScore < DELEGATION_DEMOTION_THRESHOLD ||
    state.errorRate >= 0.3 ||
    state.gatePassRate < 0.5;

  if (demotionTriggers && state.currentLevel !== 'manual') {
    const verdict: GraduationVerdict = {
      area: state.area,
      workspaceId: state.workspaceId,
      verdict: 'demote',
      confidence: computeConfidence(state, 'demote'),
      reasons: buildReasons(state, 'demote'),
      suggestedLevel: computeSuggestedLevel(state, 'demote'),
      generatedAt: new Date(ctx.nowMs).toISOString(),
    };
    return verdict;
  }

  if (state.currentLevel === 'autonomous') {
    const verdict: GraduationVerdict = {
      area: state.area,
      workspaceId: state.workspaceId,
      verdict: 'hold',
      confidence: state.confidenceScore,
      reasons: ['area already at maximum autonomy level'],
      suggestedLevel: 'autonomous',
      generatedAt: new Date(ctx.nowMs).toISOString(),
    };
    return verdict;
  }

  if (cooldownActive) {
    const verdict: GraduationVerdict = {
      area: state.area,
      workspaceId: state.workspaceId,
      verdict: 'hold',
      confidence: state.confidenceScore,
      reasons: ['graduation cooldown window active'],
      suggestedLevel: state.currentLevel,
      generatedAt: new Date(ctx.nowMs).toISOString(),
    };
    return verdict;
  }

  const canGraduate =
    state.confidenceScore >= DELEGATION_GRADUATION_THRESHOLD &&
    state.cyclesAtCurrentLevel >= DELEGATION_MIN_CYCLES_FOR_GRADUATION &&
    state.evidenceCount >= DELEGATION_MIN_EVIDENCE_FOR_GRADUATION &&
    state.errorRate < 0.15 &&
    state.gatePassRate >= 0.8;

  if (canGraduate) {
    const verdict: GraduationVerdict = {
      area: state.area,
      workspaceId: state.workspaceId,
      verdict: 'promote',
      confidence: computeConfidence(state, 'promote'),
      reasons: buildReasons(state, 'promote'),
      suggestedLevel: computeSuggestedLevel(state, 'promote'),
      generatedAt: new Date(ctx.nowMs).toISOString(),
    };
    return verdict;
  }

  const verdict: GraduationVerdict = {
    area: state.area,
    workspaceId: state.workspaceId,
    verdict: 'hold',
    confidence: computeConfidence(state, 'hold'),
    reasons: buildReasons(state, 'hold'),
    suggestedLevel: state.currentLevel,
    generatedAt: new Date(ctx.nowMs).toISOString(),
  };
  return verdict;
}
