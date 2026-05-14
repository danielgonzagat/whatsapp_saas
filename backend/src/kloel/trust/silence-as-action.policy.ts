/**
 * UTP-TRUST-006 — Silence-as-Action Policy
 *
 * Pure function deciding whether the organism should remain silent
 * based on the current trust state. Silence is a valid action when
 * continuation would erode trust.
 *
 * Input: TrustState. Output: SilenceDecision.
 */

import type { TrustState, SilenceDecision } from './trust.types';

export interface SilenceConfig {
  readonly fatigueSilenceThreshold: number;
  readonly desperationSilenceThreshold: number;
  readonly trustFloorForSilence: number;
  readonly maxSilentInteractions: number;
}

export const DEFAULT_SILENCE_CONFIG: SilenceConfig = {
  fatigueSilenceThreshold: 0.7,
  desperationSilenceThreshold: 0.6,
  trustFloorForSilence: 0.2,
  maxSilentInteractions: 5,
};

export function decideSilence(
  state: TrustState,
  config: Partial<SilenceConfig> = {},
): SilenceDecision {
  const cfg: SilenceConfig = { ...DEFAULT_SILENCE_CONFIG, ...config };

  if (state.fatigueLevel >= cfg.fatigueSilenceThreshold) {
    return {
      remainSilent: true,
      reason: `fatigue level ${state.fatigueLevel.toFixed(2)} >= threshold ${cfg.fatigueSilenceThreshold} — pause needed`,
    };
  }

  if (state.desperationLevel >= cfg.desperationSilenceThreshold) {
    return {
      remainSilent: true,
      reason: `desperation level ${state.desperationLevel.toFixed(2)} >= threshold ${cfg.desperationSilenceThreshold} — cooling period required`,
    };
  }

  if (state.trustScore <= cfg.trustFloorForSilence && state.fatigueLevel > 0.3) {
    return {
      remainSilent: true,
      reason: `trust score ${state.trustScore.toFixed(2)} critically low with fatigue — silence to avoid further erosion`,
    };
  }

  if (state.silentInteractionsCount > cfg.maxSilentInteractions) {
    return {
      remainSilent: true,
      reason: `silentInteractionsCount ${state.silentInteractionsCount} exceeds max ${cfg.maxSilentInteractions} — stop reaching out`,
    };
  }

  const hasBrandRisk = state.brandRiskFlags.length > 0;
  if (hasBrandRisk && state.trustScore < 0.4) {
    return {
      remainSilent: true,
      reason: `${state.brandRiskFlags.length} brand risk flag(s) and trust below 0.4 — remain silent`,
    };
  }

  return {
    remainSilent: false,
    reason: `trust state within operational bounds`,
  };
}
