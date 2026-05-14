/**
 * UTP-TRUST-007 — Human Handoff Trigger
 *
 * Decides when to hand off a conversation to a human operator.
 * Returns the decision with a structured reason and urgency level.
 *
 * Pure function — stateless. Input: TrustState + handoff config.
 * Output: HandoffDecision.
 */

import type { TrustState, HandoffDecision } from './trust.types';

export interface HandoffConfig {
  readonly trustScoreFloor: number;
  readonly fatigueCeilingForHandoff: number;
  readonly desperationCeilingForHandoff: number;
  readonly silentInteractionsMax: number;
}

export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = {
  trustScoreFloor: 0.15,
  fatigueCeilingForHandoff: 0.85,
  desperationCeilingForHandoff: 0.8,
  silentInteractionsMax: 8,
};

export function shouldHandoff(
  state: TrustState,
  config: Partial<HandoffConfig> = {},
): HandoffDecision {
  const cfg: HandoffConfig = { ...DEFAULT_HANDOFF_CONFIG, ...config };

  if (state.trustScore <= cfg.trustScoreFloor) {
    return {
      shouldHandoff: true,
      reason: `trust score ${state.trustScore.toFixed(2)} at or below floor ${cfg.trustScoreFloor} — handoff to human`,
      urgency: 'high',
    };
  }

  if (
    state.fatigueLevel >= cfg.fatigueCeilingForHandoff &&
    state.desperationLevel >= cfg.desperationCeilingForHandoff
  ) {
    return {
      shouldHandoff: true,
      reason: `combined fatigue (${state.fatigueLevel.toFixed(2)}) and desperation (${state.desperationLevel.toFixed(2)}) at handoff ceilings — human intervention needed`,
      urgency: 'high',
    };
  }

  if (
    state.fatigueLevel >= cfg.fatigueCeilingForHandoff &&
    state.brandRiskFlags.length > 0
  ) {
    return {
      shouldHandoff: true,
      reason: `fatigue (${state.fatigueLevel.toFixed(2)}) combined with ${state.brandRiskFlags.length} brand risk flags — escalate`,
      urgency: 'medium',
    };
  }

  if (state.silentInteractionsCount >= cfg.silentInteractionsMax) {
    return {
      shouldHandoff: true,
      reason: `silent interactions count ${state.silentInteractionsCount} exceeded max ${cfg.silentInteractionsMax} — human should assess`,
      urgency: 'low',
    };
  }

  if (
    state.trustScore < 0.3 &&
    state.fatigueLevel >= 0.6
  ) {
    return {
      shouldHandoff: true,
      reason: `low trust (${state.trustScore.toFixed(2)}) and elevated fatigue (${state.fatigueLevel.toFixed(2)}) — recommend handoff`,
      urgency: 'medium',
    };
  }

  return {
    shouldHandoff: false,
    reason: `trust state does not trigger handoff threshold`,
    urgency: 'low',
  };
}
