import type { CiaActionType, CiaCandidate } from './build-state';
import type { CustomerCognitiveState } from './cognitive-state';
import type { ActionOption, OptionBaseline, CiaStrategyHints } from './brain.types';

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function option(
  type: CiaActionType,
  reason: string,
  rewardScore: number,
  riskScore: number,
  confidence: number,
  variantFamily?: 'followup' | 'payment_recovery',
): ActionOption {
  return {
    type,
    reason,
    rewardScore: Number(rewardScore.toFixed(3)),
    riskScore: Number(clamp(riskScore, 0, 1).toFixed(3)),
    confidence: Number(clamp(confidence, 0.05, 0.99).toFixed(3)),
    variantFamily,
  };
}

export function actionUtility(input: ActionOption, strategy?: CiaStrategyHints | null) {
  const familyBoost =
    strategy?.preferredVariantFamily && strategy.preferredVariantFamily === input.variantFamily
      ? 0.16
      : 0;
  const confidenceBoost = Number(strategy?.confidence || 0) * 0.06;
  return Number((input.rewardScore - input.riskScore + familyBoost + confidenceBoost).toFixed(3));
}

function resolveStageRewardBonus(stage: CustomerCognitiveState['stage']): number {
  if (stage === 'CHECKOUT') {
    return 0.35;
  }
  if (stage === 'HOT') {
    return 0.2;
  }
  return 0;
}

function resolveBaseReward(candidate: CiaCandidate, state: CustomerCognitiveState): number {
  return (
    candidate.priority / 100 +
    state.trustScore * 0.35 +
    state.urgencyScore * 0.45 +
    resolveStageRewardBonus(state.stage)
  );
}

function resolveBaseRisk(state: CustomerCognitiveState): number {
  const supportPenalty = state.intent === 'SUPPORT' ? 0.18 : 0;
  const pricePenalty = state.priceSensitivity > 0.75 ? 0.07 : 0;
  return state.riskFlags.length * 0.22 + supportPenalty + pricePenalty;
}

function resolveBaseConfidence(state: CustomerCognitiveState): number {
  return Number(state.classificationConfidence || 0.58) || 0.58;
}

export function computeOptionBaseline(candidate: CiaCandidate): OptionBaseline {
  const state = candidate.cognitiveState;
  return {
    baseConfidence: resolveBaseConfidence(state),
    baseReward: resolveBaseReward(candidate, state),
    baseRisk: resolveBaseRisk(state),
  };
}

function buildWaitOption(baseline: OptionBaseline): ActionOption {
  return option(
    'WAIT',
    'timing_hold',
    Math.max(0.05, baseline.baseReward * 0.3),
    Math.max(0.02, baseline.baseRisk * 0.2),
    clamp(baseline.baseConfidence - 0.05, 0.1, 0.8),
  );
}

function buildRiskFlagOption(baseline: OptionBaseline): ActionOption {
  return option(
    'ESCALATE_HUMAN',
    'risk_flagged_case',
    baseline.baseReward * 0.9,
    Math.max(0.05, baseline.baseRisk * 0.15),
    clamp(baseline.baseConfidence, 0.2, 0.92),
  );
}

function buildUnreadOptions(candidate: CiaCandidate, baseline: OptionBaseline): ActionOption[] {
  return [
    option(
      'RESPOND',
      'reactive_backlog_detected',
      baseline.baseReward + 0.28 + candidate.unreadCount * 0.04,
      baseline.baseRisk,
      clamp(baseline.baseConfidence + 0.1),
    ),
    option(
      'ASK_CLARIFYING',
      'clarify_to_reduce_uncertainty',
      baseline.baseReward + 0.12,
      Math.max(0.01, baseline.baseRisk * 0.55),
      clamp(baseline.baseConfidence - 0.04),
    ),
  ];
}

function buildPriceObjectionOption(
  state: CustomerCognitiveState,
  baseline: OptionBaseline,
): ActionOption {
  return option(
    'SOCIAL_PROOF',
    'price_objection_requires_trust',
    baseline.baseReward + 0.22 + (state.trustScore < 0.55 ? 0.08 : 0),
    baseline.baseRisk * 0.72,
    clamp(baseline.baseConfidence + 0.04),
  );
}

function isPaymentIntent(state: CustomerCognitiveState): boolean {
  return state.paymentState === 'PENDING' || state.intent === 'PAYMENT';
}

function buildHighIntentOption(
  state: CustomerCognitiveState,
  baseline: OptionBaseline,
): ActionOption {
  const paymentIntent = isPaymentIntent(state);
  return option(
    paymentIntent ? 'PAYMENT_RECOVERY' : 'OFFER',
    paymentIntent ? 'payment_recovery_priority' : 'high_intent_offer',
    baseline.baseReward + (paymentIntent ? 0.45 : 0.35),
    baseline.baseRisk + (state.priceSensitivity > 0.8 ? 0.04 : 0),
    clamp(baseline.baseConfidence + 0.12),
    paymentIntent ? 'payment_recovery' : undefined,
  );
}

function buildPendingPaymentOption(baseline: OptionBaseline): ActionOption {
  return option(
    'PAYMENT_RECOVERY',
    'pending_payment_detected',
    baseline.baseReward + 0.42,
    Math.max(0.01, baseline.baseRisk * 0.6),
    clamp(baseline.baseConfidence + 0.1),
    'payment_recovery',
  );
}

function buildFollowupOptions(
  state: CustomerCognitiveState,
  baseline: OptionBaseline,
): ActionOption[] {
  const followups: ActionOption[] = [];
  if (state.silenceMinutes >= 24 * 60 || state.urgencyScore >= 0.72) {
    followups.push(
      option(
        'FOLLOWUP_URGENT',
        'urgent_reengagement_window',
        baseline.baseReward + 0.24,
        baseline.baseRisk + 0.12,
        clamp(baseline.baseConfidence + 0.02),
        'followup',
      ),
    );
  }
  if (state.silenceMinutes >= 6 * 60 || state.stage === 'WARM') {
    followups.push(
      option(
        'FOLLOWUP_SOFT',
        'warm_reengagement_window',
        baseline.baseReward + 0.15,
        baseline.baseRisk + 0.06,
        clamp(baseline.baseConfidence, 0.1, 0.95),
        'followup',
      ),
    );
  }
  return followups;
}

function shouldAddHighIntent(state: CustomerCognitiveState): boolean {
  return (
    state.stage === 'HOT' ||
    state.stage === 'CHECKOUT' ||
    state.desires.includes('resultado_rapido')
  );
}

function shouldAddPendingPayment(candidate: CiaCandidate): boolean {
  const state = candidate.cognitiveState;
  return (
    state.paymentState === 'PENDING' ||
    state.paymentState === 'READY_TO_PAY' ||
    candidate.cluster === 'PAYMENT'
  );
}

export function buildOptions(candidate: CiaCandidate) {
  const state = candidate.cognitiveState;
  const baseline = computeOptionBaseline(candidate);
  const options: ActionOption[] = [buildWaitOption(baseline)];

  if (state.riskFlags.length > 0) {
    options.push(buildRiskFlagOption(baseline));
  }
  if (candidate.unreadCount > 0) {
    options.push(...buildUnreadOptions(candidate, baseline));
  }
  if (state.objections.includes('price')) {
    options.push(buildPriceObjectionOption(state, baseline));
  }
  if (shouldAddHighIntent(state)) {
    options.push(buildHighIntentOption(state, baseline));
  }
  if (shouldAddPendingPayment(candidate)) {
    options.push(buildPendingPaymentOption(baseline));
  }
  if (candidate.unreadCount === 0) {
    options.push(...buildFollowupOptions(state, baseline));
  }

  return options;
}
