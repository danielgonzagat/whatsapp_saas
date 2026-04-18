import type { CiaActionType, CiaCandidate, CiaCluster, CiaWorkspaceState } from './build-state';
import type { CustomerCognitiveState } from './cognitive-state';
import {
  type ConversationTacticCandidate,
  type ConversationTacticType,
  buildConversationTacticPlan,
} from './conversation-tactics';

export type CiaGovernorVerdict = 'EXECUTE' | 'ASK' | 'WAIT' | 'ESCALATE';

export interface CiaActionDecision {
  type: CiaActionType;
  cluster: CiaCluster;
  contactId?: string;
  phone?: string;
  contactName?: string;
  conversationId: string;
  priority: number;
  reason: string;
  lastMessageText: string;
  variantFamily?: 'followup' | 'payment_recovery';
  confidence: number;
  riskScore: number;
  rewardScore: number;
  selectedActionUtility: number;
  selectedActionRank: number;
  betterActionCount: number;
  betterExecutableActionCount: number;
  nextBestActionType: CiaActionType | null;
  nextBestActionUtility: number | null;
  governor: CiaGovernorVerdict;
  conversationActionUniverse: ConversationActionCandidate[];
  conversationTactic: ConversationTacticType | null;
  selectedTacticUtility: number | null;
  selectedTacticRank: number | null;
  betterTacticCount: number;
  nextBestTactic: ConversationTacticType | null;
  nextBestTacticUtility: number | null;
  conversationTacticUniverse: ConversationTacticCandidate[];
  cognitiveState: CustomerCognitiveState;
  demandState: CiaCandidate['demandState'];
  recommendedBy: 'nba_engine';
}

export interface CiaDecisionBatch {
  actions: CiaActionDecision[];
  ignoredCount: number;
  summary: string;
}

export interface CiaStrategyHints {
  aggressiveness?: 'LOW' | 'MEDIUM' | 'HIGH';
  preferredVariantFamily?: string | null;
  confidence?: number;
}

export interface ConversationActionCandidate {
  type: CiaActionType;
  governor: CiaGovernorVerdict;
  reason: string;
  utility: number;
  rank: number;
  utilityGapToBest: number;
  betterActionCount: number;
  confidence: number;
  riskScore: number;
  rewardScore: number;
  executable: boolean;
  selected: boolean;
  variantFamily?: 'followup' | 'payment_recovery';
}

interface ActionOption {
  type: CiaActionType;
  reason: string;
  rewardScore: number;
  riskScore: number;
  confidence: number;
  variantFamily?: 'followup' | 'payment_recovery';
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function option(
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

function actionUtility(input: ActionOption, strategy?: CiaStrategyHints | null) {
  const familyBoost =
    strategy?.preferredVariantFamily && strategy.preferredVariantFamily === input.variantFamily
      ? 0.16
      : 0;
  const confidenceBoost = Number(strategy?.confidence || 0) * 0.06;
  return Number((input.rewardScore - input.riskScore + familyBoost + confidenceBoost).toFixed(3));
}

interface OptionBaseline {
  baseConfidence: number;
  baseReward: number;
  baseRisk: number;
}

function resolveStageRewardBonus(stage: CustomerCognitiveState['stage']): number {
  if (stage === 'CHECKOUT') return 0.35;
  if (stage === 'HOT') return 0.2;
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

function computeOptionBaseline(candidate: CiaCandidate): OptionBaseline {
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

function buildOptions(candidate: CiaCandidate) {
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

function applyGovernor(selected: ActionOption, candidate: CiaCandidate): CiaActionDecision {
  const state = candidate.cognitiveState;
  let type = selected.type;
  let governor: CiaGovernorVerdict = 'EXECUTE';
  let reason = selected.reason;

  if (selected.type === 'WAIT') {
    governor = 'WAIT';
    reason = 'timing_not_good_enough';
  } else if (
    selected.type === 'ESCALATE_HUMAN' ||
    selected.riskScore >= 0.25 ||
    state.riskFlags.length > 0 ||
    state.intent === 'SUPPORT'
  ) {
    governor = 'ESCALATE';
    type = 'ESCALATE_HUMAN';
    reason = state.riskFlags.length > 0 ? 'risk_flagged_case' : 'confidence_too_low';
  } else if (selected.confidence < 0.45) {
    governor = 'ESCALATE';
    type = 'ESCALATE_HUMAN';
    reason = 'confidence_too_low';
  } else if (selected.confidence < 0.75 && selected.type !== 'ASK_CLARIFYING') {
    governor = 'ASK';
    type = 'ASK_CLARIFYING';
    reason = 'clarify_before_committing';
  }
  const tacticPlan = buildConversationTacticPlan({
    action: type,
    state,
  });

  return {
    type,
    cluster: candidate.cluster,
    contactId: candidate.contactId,
    phone: candidate.phone,
    contactName: candidate.contactName,
    conversationId: candidate.conversationId,
    priority: Number((selected.rewardScore - selected.riskScore).toFixed(3)),
    reason,
    lastMessageText: candidate.lastMessageText,
    variantFamily:
      type === 'PAYMENT_RECOVERY'
        ? 'payment_recovery'
        : type === 'FOLLOWUP_SOFT' || type === 'FOLLOWUP_URGENT'
          ? 'followup'
          : selected.variantFamily,
    confidence: selected.confidence,
    riskScore: selected.riskScore,
    rewardScore: selected.rewardScore,
    selectedActionUtility: 0,
    selectedActionRank: 0,
    betterActionCount: 0,
    betterExecutableActionCount: 0,
    nextBestActionType: null,
    nextBestActionUtility: null,
    governor,
    conversationActionUniverse: [],
    conversationTactic: tacticPlan.selectedTactic,
    selectedTacticUtility: tacticPlan.selectedTacticUtility,
    selectedTacticRank: tacticPlan.selectedTacticRank,
    betterTacticCount: tacticPlan.betterTacticCount,
    nextBestTactic: tacticPlan.nextBestTactic,
    nextBestTacticUtility: tacticPlan.nextBestTacticUtility,
    conversationTacticUniverse: tacticPlan.candidates,
    cognitiveState: candidate.cognitiveState,
    demandState: candidate.demandState,
    recommendedBy: 'nba_engine',
  };
}

function buildActionUniverse(
  options: ActionOption[],
  candidate: CiaCandidate,
  strategy: CiaStrategyHints | null | undefined,
  bestUtility: number,
): ConversationActionCandidate[] {
  return options.map((candidateOption, index) => {
    const projected = applyGovernor(candidateOption, candidate);
    const utility = actionUtility(candidateOption, strategy);
    return {
      type: projected.type,
      governor: projected.governor,
      reason: projected.reason,
      utility,
      rank: index + 1,
      utilityGapToBest: Number((bestUtility - utility).toFixed(3)),
      betterActionCount: index,
      confidence: projected.confidence,
      riskScore: projected.riskScore,
      rewardScore: projected.rewardScore,
      executable: projected.governor === 'EXECUTE',
      selected: index === 0,
      variantFamily: projected.variantFamily,
    } satisfies ConversationActionCandidate;
  });
}

function countBetterExecutableActions(
  universe: ConversationActionCandidate[],
  selected: ConversationActionCandidate | undefined,
): number {
  const limit = selected ? selected.rank - 1 : 0;
  return universe.slice(0, limit).filter((item) => item.executable).length;
}

function toDecision(
  candidate: CiaCandidate,
  strategy?: CiaStrategyHints | null,
): CiaActionDecision {
  const options = buildOptions(candidate).sort((left, right) => {
    return actionUtility(right, strategy) - actionUtility(left, strategy);
  });
  const selected = options[0] || option('WAIT', 'timing_hold', 0.1, 0.01, 0.5);
  const selectedDecision = applyGovernor(selected, candidate);
  const bestUtility = actionUtility(selected, strategy);
  const actionUniverse = buildActionUniverse(options, candidate, strategy, bestUtility);
  const selectedAction = actionUniverse[0];
  const nextBestAction = actionUniverse[1];
  const betterExecutableActionCount = countBetterExecutableActions(actionUniverse, selectedAction);

  return {
    ...selectedDecision,
    selectedActionUtility: selectedAction?.utility || 0,
    selectedActionRank: selectedAction?.rank || 1,
    betterActionCount: selectedAction?.betterActionCount || 0,
    betterExecutableActionCount,
    nextBestActionType: nextBestAction?.type || null,
    nextBestActionUtility: nextBestAction?.utility || null,
    conversationActionUniverse: actionUniverse,
  };
}

export function evaluateCiaCandidate(
  candidate: CiaCandidate,
  strategy?: CiaStrategyHints | null,
): CiaActionDecision {
  return toDecision(candidate, strategy);
}

function takeBest(
  source: CiaCandidate[],
  chosen: Map<string, CiaActionDecision>,
  strategy?: CiaStrategyHints | null,
): CiaActionDecision | null {
  for (const candidate of source) {
    const key = candidate.contactId || candidate.phone || candidate.conversationId;
    if (chosen.has(key)) continue;
    const decision = toDecision(candidate, strategy);
    if (decision.type === 'WAIT') {
      continue;
    }
    chosen.set(key, decision);
    return decision;
  }
  return null;
}

function actionLabel(action: CiaActionType) {
  switch (action) {
    case 'RESPOND':
      return 'resposta';
    case 'ASK_CLARIFYING':
      return 'pergunta de qualificação';
    case 'SOCIAL_PROOF':
      return 'prova social';
    case 'OFFER':
      return 'oferta';
    case 'FOLLOWUP_SOFT':
      return 'follow-up leve';
    case 'FOLLOWUP_URGENT':
      return 'follow-up urgente';
    case 'PAYMENT_RECOVERY':
      return 'recuperação de pagamento';
    case 'ESCALATE_HUMAN':
      return 'escalada humana';
    default:
      return 'ação';
  }
}

function resolveMaxActions(
  maxActionsPerCycle: number | undefined,
  strategy: CiaStrategyHints | null,
): number {
  const base = Number(maxActionsPerCycle || 5) || 5;
  let adjusted = base;
  if (strategy?.aggressiveness === 'HIGH') adjusted = base + 1;
  else if (strategy?.aggressiveness === 'LOW') adjusted = base - 1;
  return Math.max(1, Math.min(10, adjusted));
}

function collectPriorityActions(
  state: CiaWorkspaceState,
  strategy: CiaStrategyHints | null,
  chosen: Map<string, CiaActionDecision>,
  actions: CiaActionDecision[],
  maxActions: number,
): void {
  const ordered = [...state.candidates]
    .map((candidate) => toDecision(candidate, strategy))
    .filter((decision) => decision.type !== 'WAIT')
    .sort((left, right) => right.priority - left.priority);

  for (const decision of ordered) {
    if (actions.length >= maxActions) break;
    const key = decision.contactId || decision.phone || decision.conversationId;
    if (chosen.has(key)) continue;
    chosen.set(key, decision);
    actions.push(decision);
  }
}

function buildActionCounts(actions: CiaActionDecision[]): Record<string, number> {
  return actions.reduce<Record<string, number>>((acc, action) => {
    acc[action.type] = (acc[action.type] || 0) + 1;
    return acc;
  }, {});
}

function buildSummaryParts(counts: Record<string, number>): string[] {
  return [
    counts.RESPOND ? `${counts.RESPOND} respostas` : null,
    counts.ASK_CLARIFYING ? `${counts.ASK_CLARIFYING} perguntas de qualificação` : null,
    counts.OFFER ? `${counts.OFFER} ofertas` : null,
    counts.SOCIAL_PROOF ? `${counts.SOCIAL_PROOF} provas sociais` : null,
    counts.PAYMENT_RECOVERY ? `${counts.PAYMENT_RECOVERY} recuperações de pagamento` : null,
    counts.FOLLOWUP_SOFT || counts.FOLLOWUP_URGENT
      ? `${(counts.FOLLOWUP_SOFT || 0) + (counts.FOLLOWUP_URGENT || 0)} follow-ups`
      : null,
    counts.ESCALATE_HUMAN ? `${counts.ESCALATE_HUMAN} exceções humanas` : null,
  ].filter(Boolean) as string[];
}

export function planCiaActions(
  state: CiaWorkspaceState,
  options?: {
    maxActionsPerCycle?: number;
    strategy?: CiaStrategyHints | null;
  },
): CiaDecisionBatch {
  const strategy = options?.strategy || null;
  const maxActions = resolveMaxActions(options?.maxActionsPerCycle, strategy);
  const chosen = new Map<string, CiaActionDecision>();
  const actions: CiaActionDecision[] = [];

  const hot = takeBest(state.clusters.HOT, chosen, strategy);
  if (hot) actions.push(hot);

  const payment = takeBest(state.clusters.PAYMENT, chosen, strategy);
  if (payment) actions.push(payment);

  collectPriorityActions(state, strategy, chosen, actions, maxActions);

  const byPriority = actions.sort((a, b) => b.priority - a.priority).slice(0, maxActions);
  const counts = buildActionCounts(byPriority);
  const summaryParts = buildSummaryParts(counts);

  return {
    actions: byPriority,
    ignoredCount: Math.max(state.candidates.length - byPriority.length, 0),
    summary:
      byPriority.length > 0
        ? `Vou agir agora em ${byPriority.length} frentes: ${summaryParts.join(', ')}.`
        : 'Não encontrei uma ação segura para este ciclo agora.',
  };
}

export function summarizeDecisionCognition(decision: CiaActionDecision) {
  return `${actionLabel(decision.type)} • ${decision.cognitiveState.summary}`;
}
