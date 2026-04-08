import type { CiaActionType, CiaCandidate, CiaCluster, CiaWorkspaceState } from './build-state';
import type { CustomerCognitiveState } from './cognitive-state';
import {
  buildConversationTacticPlan,
  type ConversationTacticCandidate,
  type ConversationTacticType,
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

function buildOptions(candidate: CiaCandidate) {
  const state = candidate.cognitiveState;
  const options: ActionOption[] = [];
  const baseConfidence = Number(state.classificationConfidence || 0.58) || 0.58;
  const baseReward =
    candidate.priority / 100 +
    state.trustScore * 0.35 +
    state.urgencyScore * 0.45 +
    (state.stage === 'CHECKOUT' ? 0.35 : state.stage === 'HOT' ? 0.2 : 0);
  const baseRisk =
    state.riskFlags.length * 0.22 +
    (state.intent === 'SUPPORT' ? 0.18 : 0) +
    (state.priceSensitivity > 0.75 ? 0.07 : 0);

  options.push(
    option(
      'WAIT',
      'timing_hold',
      Math.max(0.05, baseReward * 0.3),
      Math.max(0.02, baseRisk * 0.2),
      clamp(baseConfidence - 0.05, 0.1, 0.8),
    ),
  );

  if (state.riskFlags.length > 0) {
    options.push(
      option(
        'ESCALATE_HUMAN',
        'risk_flagged_case',
        baseReward * 0.9,
        Math.max(0.05, baseRisk * 0.15),
        clamp(baseConfidence, 0.2, 0.92),
      ),
    );
  }

  if (candidate.unreadCount > 0) {
    options.push(
      option(
        'RESPOND',
        'reactive_backlog_detected',
        baseReward + 0.28 + candidate.unreadCount * 0.04,
        baseRisk,
        clamp(baseConfidence + 0.1),
      ),
    );
    options.push(
      option(
        'ASK_CLARIFYING',
        'clarify_to_reduce_uncertainty',
        baseReward + 0.12,
        Math.max(0.01, baseRisk * 0.55),
        clamp(baseConfidence - 0.04),
      ),
    );
  }

  if (state.objections.includes('price')) {
    options.push(
      option(
        'SOCIAL_PROOF',
        'price_objection_requires_trust',
        baseReward + 0.22 + (state.trustScore < 0.55 ? 0.08 : 0),
        baseRisk * 0.72,
        clamp(baseConfidence + 0.04),
      ),
    );
  }

  if (
    state.stage === 'HOT' ||
    state.stage === 'CHECKOUT' ||
    state.desires.includes('resultado_rapido')
  ) {
    options.push(
      option(
        state.paymentState === 'PENDING' || state.intent === 'PAYMENT'
          ? 'PAYMENT_RECOVERY'
          : 'OFFER',
        state.paymentState === 'PENDING' || state.intent === 'PAYMENT'
          ? 'payment_recovery_priority'
          : 'high_intent_offer',
        baseReward + (state.paymentState === 'PENDING' || state.intent === 'PAYMENT' ? 0.45 : 0.35),
        baseRisk + (state.priceSensitivity > 0.8 ? 0.04 : 0),
        clamp(baseConfidence + 0.12),
        state.paymentState === 'PENDING' || state.intent === 'PAYMENT'
          ? 'payment_recovery'
          : undefined,
      ),
    );
  }

  if (
    state.paymentState === 'PENDING' ||
    state.paymentState === 'READY_TO_PAY' ||
    candidate.cluster === 'PAYMENT'
  ) {
    options.push(
      option(
        'PAYMENT_RECOVERY',
        'pending_payment_detected',
        baseReward + 0.42,
        Math.max(0.01, baseRisk * 0.6),
        clamp(baseConfidence + 0.1),
        'payment_recovery',
      ),
    );
  }

  if (candidate.unreadCount === 0) {
    if (state.silenceMinutes >= 24 * 60 || state.urgencyScore >= 0.72) {
      options.push(
        option(
          'FOLLOWUP_URGENT',
          'urgent_reengagement_window',
          baseReward + 0.24,
          baseRisk + 0.12,
          clamp(baseConfidence + 0.02),
          'followup',
        ),
      );
    }
    if (state.silenceMinutes >= 6 * 60 || state.stage === 'WARM') {
      options.push(
        option(
          'FOLLOWUP_SOFT',
          'warm_reengagement_window',
          baseReward + 0.15,
          baseRisk + 0.06,
          clamp(baseConfidence, 0.1, 0.95),
          'followup',
        ),
      );
    }
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
  const actionUniverse = options.map((candidateOption, index) => {
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
  const selectedAction = actionUniverse[0];
  const nextBestAction = actionUniverse[1];
  const betterExecutableActionCount = actionUniverse
    .slice(0, selectedAction ? selectedAction.rank - 1 : 0)
    .filter((item) => item.executable).length;

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

export function planCiaActions(
  state: CiaWorkspaceState,
  options?: {
    maxActionsPerCycle?: number;
    strategy?: CiaStrategyHints | null;
  },
): CiaDecisionBatch {
  const strategy = options?.strategy || null;
  const strategyAdjustedMaxActions = (() => {
    const base = Number(options?.maxActionsPerCycle || 5) || 5;
    if (strategy?.aggressiveness === 'HIGH') return base + 1;
    if (strategy?.aggressiveness === 'LOW') return base - 1;
    return base;
  })();
  const maxActions = Math.max(1, Math.min(10, strategyAdjustedMaxActions));
  const chosen = new Map<string, CiaActionDecision>();
  const actions: CiaActionDecision[] = [];

  const hot = takeBest(state.clusters.HOT, chosen, strategy);
  if (hot) actions.push(hot);

  const payment = takeBest(state.clusters.PAYMENT, chosen, strategy);
  if (payment) actions.push(payment);

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

  const byPriority = actions.sort((a, b) => b.priority - a.priority).slice(0, maxActions);

  const counts = byPriority.reduce<Record<string, number>>((acc, action) => {
    acc[action.type] = (acc[action.type] || 0) + 1;
    return acc;
  }, {});

  const summaryParts = [
    counts.RESPOND ? `${counts.RESPOND} respostas` : null,
    counts.ASK_CLARIFYING ? `${counts.ASK_CLARIFYING} perguntas de qualificação` : null,
    counts.OFFER ? `${counts.OFFER} ofertas` : null,
    counts.SOCIAL_PROOF ? `${counts.SOCIAL_PROOF} provas sociais` : null,
    counts.PAYMENT_RECOVERY ? `${counts.PAYMENT_RECOVERY} recuperações de pagamento` : null,
    counts.FOLLOWUP_SOFT || counts.FOLLOWUP_URGENT
      ? `${(counts.FOLLOWUP_SOFT || 0) + (counts.FOLLOWUP_URGENT || 0)} follow-ups`
      : null,
    counts.ESCALATE_HUMAN ? `${counts.ESCALATE_HUMAN} exceções humanas` : null,
  ].filter(Boolean);

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
