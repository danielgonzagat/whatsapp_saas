/**
 * UTP-TRUST-008 — Trust Recovery Tactics
 *
 * Proposes recovery actions when trustScore drops below operational
 * thresholds. Returns ranked actions with suggested delay.
 *
 * Pure function — stateless. Input: TrustState. Output: RecoveryAction[].
 */

import type { TrustState, RecoveryAction, RecoveryActionKind } from './trust.types';

export interface RecoveryConfig {
  readonly trustScoreFloor: number;
  readonly minDelayMinutes: number;
  readonly maxDelayMinutes: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  trustScoreFloor: 0.4,
  minDelayMinutes: 5,
  maxDelayMinutes: 1440,
};

interface RecoveryRule {
  readonly action: RecoveryActionKind;
  readonly condition: (state: TrustState) => boolean;
  readonly priority: number;
  readonly delayMinutes: number;
  readonly reasonTemplate: (state: TrustState) => string;
}

const RECOVERY_RULES: readonly RecoveryRule[] = [
  {
    action: 'escalate_to_human',
    condition: (s) => s.trustScore <= 0.15,
    priority: 1,
    delayMinutes: 1,
    reasonTemplate: (s) =>
      `trust score critically low (${s.trustScore.toFixed(2)}) — immediate human escalation`,
  },
  {
    action: 'wait_and_cool_down',
    condition: (s) => s.fatigueLevel >= 0.7 || s.desperationLevel >= 0.7,
    priority: 2,
    delayMinutes: 60,
    reasonTemplate: (s) =>
      `fatigue ${s.fatigueLevel.toFixed(2)} / desperation ${s.desperationLevel.toFixed(2)} high — cool-down period`,
  },
  {
    action: 'acknowledge_mistake',
    condition: (s) => s.brandRiskFlags.length > 0 && s.trustScore < 0.5,
    priority: 3,
    delayMinutes: 15,
    reasonTemplate: (s) =>
      `${s.brandRiskFlags.length} brand risk flag(s) detected at low trust — acknowledge and reset`,
  },
  {
    action: 'reduce_frequency',
    condition: (s) => s.silentInteractionsCount >= 3,
    priority: 4,
    delayMinutes: 120,
    reasonTemplate: (s) =>
      `${s.silentInteractionsCount} silent interactions — reduce message frequency`,
  },
  {
    action: 'provide_value',
    condition: (s) => s.trustScore >= 0.2 && s.trustScore < 0.5,
    priority: 5,
    delayMinutes: 30,
    reasonTemplate: (s) =>
      `trust score moderate (${s.trustScore.toFixed(2)}) — re-engage with value, not pitch`,
  },
  {
    action: 'change_channel',
    condition: (s) => s.fatigueLevel >= 0.5 && s.silentInteractionsCount >= 2,
    priority: 6,
    delayMinutes: 180,
    reasonTemplate: (s) =>
      `channel fatigue (${s.fatigueLevel.toFixed(2)}) and silence (${s.silentInteractionsCount}) — try alternative channel`,
  },
];

export function proposeRecoveryActions(
  state: TrustState,
  config: Partial<RecoveryConfig> = {},
): readonly RecoveryAction[] {
  const cfg: RecoveryConfig = { ...DEFAULT_RECOVERY_CONFIG, ...config };

  if (state.trustScore >= cfg.trustScoreFloor) {
    return [];
  }

  const actions: RecoveryAction[] = [];

  for (const rule of RECOVERY_RULES) {
    if (rule.condition(state)) {
      actions.push({
        action: rule.action,
        priority: rule.priority,
        reason: rule.reasonTemplate(state),
        suggestedDelayMinutes: Math.min(
          cfg.maxDelayMinutes,
          Math.max(cfg.minDelayMinutes, rule.delayMinutes),
        ),
      });
    }
  }

  return actions.sort((a, b) => a.priority - b.priority);
}
