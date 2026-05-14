/**
 * UTP-TRUST-006 — Silence-as-Action Policy
 *
 * Pure function deciding whether the organism should remain silent
 * based on the current trust state. Silence is a valid action when
 * continuation would erode trust.
 *
 * Every decision carries an operational delegation contract
 * (riskClass, delegationMode, safeNextStep, rollback,
 * leadOutcomeGuardrail) so silence never reads as passive
 * inactivity.
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

function baseDelegation(): Pick<
  SilenceDecision,
  'riskClass' | 'delegationMode'
> {
  return {
    riskClass: 'R1',
    delegationMode: 'allowed_alone',
  };
}

function silenceRemain(params: {
  reason: string;
  safeNextStep: string;
  rollback: string;
  leadOutcomeGuardrail: string;
}): SilenceDecision {
  const base = baseDelegation();
  const decision: SilenceDecision = {
    riskClass: base.riskClass,
    delegationMode: base.delegationMode,
    remainSilent: true,
    reason: params.reason,
    safeNextStep: params.safeNextStep,
    rollback: params.rollback,
    leadOutcomeGuardrail: params.leadOutcomeGuardrail,
  };
  return decision;
}

function silenceProceed(reason: string): SilenceDecision {
  const base = baseDelegation();
  const decision: SilenceDecision = {
    riskClass: base.riskClass,
    delegationMode: base.delegationMode,
    remainSilent: false,
    reason,
    safeNextStep:
      'proceed respecting tone and frequency limits per channel policy',
    rollback: 're-evaluate trust state if a negative signal is received',
    leadOutcomeGuardrail:
      'maintain honest no-pressure tone; no false urgency or inflated claims',
  };
  return decision;
}

export function decideSilence(
  state: TrustState,
  config: Partial<SilenceConfig> = {},
): SilenceDecision {
  const cfg: SilenceConfig = { ...DEFAULT_SILENCE_CONFIG, ...config };

  if (state.fatigueLevel >= cfg.fatigueSilenceThreshold) {
    return silenceRemain({
      reason: `fatigue ${state.fatigueLevel.toFixed(2)} gte threshold ${cfg.fatigueSilenceThreshold} — cooling period recommended`,
      safeNextStep: 'wait hours before next outbound; let lead breathe',
      rollback: 'resume messaging after cooldown window elapsed',
      leadOutcomeGuardrail:
        'do not re-engage until fatigue level drops below threshold',
    });
  }

  if (state.desperationLevel >= cfg.desperationSilenceThreshold) {
    return silenceRemain({
      reason: `desperation ${state.desperationLevel.toFixed(2)} gte threshold ${cfg.desperationSilenceThreshold} — cooling period recommended`,
      safeNextStep: 'wait hours; discount escalation or overpromising detected',
      rollback: 'resume after cooling period with honest value-only messaging',
      leadOutcomeGuardrail:
        'no discount escalation or inflated promises during cooling',
    });
  }

  if (state.trustScore <= cfg.trustFloorForSilence && state.fatigueLevel > 0.3) {
    return silenceRemain({
      reason: `trust ${state.trustScore.toFixed(2)} critically low with fatigue — silence to avoid further erosion`,
      safeNextStep:
        'escalate to human review; trust floor breached with fatigue present',
      rollback: 'human returns control to agent after review',
      leadOutcomeGuardrail:
        'human must review last messages before re-engagement',
    });
  }

  if (state.silentInteractionsCount > cfg.maxSilentInteractions) {
    return silenceRemain({
      reason: `silent interactions ${state.silentInteractionsCount} exceeds max ${cfg.maxSilentInteractions} — stop reaching out`,
      safeNextStep: 'wait for lead to re-engage before any new outbound',
      rollback: 'resume when lead sends a message',
      leadOutcomeGuardrail:
        'do not initiate new outbound until lead replies first',
    });
  }

  const hasBrandRisk = state.brandRiskFlags.length > 0;
  if (hasBrandRisk && state.trustScore < 0.4) {
    return silenceRemain({
      reason: `${state.brandRiskFlags.length} brand risk flag(s) and trust ${state.trustScore.toFixed(2)} below 0.4 — remain silent`,
      safeNextStep:
        'escalate to human review; brand risk flags active with low trust',
      rollback: 'human clears brand risk flags and returns control to agent',
      leadOutcomeGuardrail:
        'no outbound messaging until brand risk flags are cleared',
    });
  }

  return silenceProceed(
    'trust state within operational bounds',
  );
}
