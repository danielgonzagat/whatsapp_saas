import type { CiaActionType, CiaCandidate, CiaWorkspaceState } from './build-state';
import type { CustomerCognitiveState } from './cognitive-state';
import { buildConversationTacticPlan } from './conversation-tactics';
import type {
  ActionOption,
  CiaActionDecision,
  CiaDecisionBatch,
  CiaGovernorVerdict,
  CiaStrategyHints,
  ConversationActionCandidate,
} from './brain.types';
import { actionUtility, buildOptions, option } from './brain.options';

export type {
  CiaActionDecision,
  CiaDecisionBatch,
  CiaGovernorVerdict,
  CiaStrategyHints,
  ConversationActionCandidate,
} from './brain.types';

interface GovernorVerdictOutcome {
  type: CiaActionType;
  governor: CiaGovernorVerdict;
  reason: string;
}

function shouldEscalateForRisk(selected: ActionOption, state: CustomerCognitiveState): boolean {
  return (
    selected.type === 'ESCALATE_HUMAN' ||
    selected.riskScore >= 0.25 ||
    state.riskFlags.length > 0 ||
    state.intent === 'SUPPORT'
  );
}

function resolveGovernorVerdict(
  selected: ActionOption,
  state: CustomerCognitiveState,
): GovernorVerdictOutcome {
  if (selected.type === 'WAIT') {
    return { type: selected.type, governor: 'WAIT', reason: 'timing_not_good_enough' };
  }
  if (shouldEscalateForRisk(selected, state)) {
    return {
      type: 'ESCALATE_HUMAN',
      governor: 'ESCALATE',
      reason: state.riskFlags.length > 0 ? 'risk_flagged_case' : 'confidence_too_low',
    };
  }
  if (selected.confidence < 0.45) {
    return { type: 'ESCALATE_HUMAN', governor: 'ESCALATE', reason: 'confidence_too_low' };
  }
  if (selected.confidence < 0.75 && selected.type !== 'ASK_CLARIFYING') {
    return { type: 'ASK_CLARIFYING', governor: 'ASK', reason: 'clarify_before_committing' };
  }
  return { type: selected.type, governor: 'EXECUTE', reason: selected.reason };
}

function resolveVariantFamily(
  type: CiaActionType,
  selectedVariantFamily: ActionOption['variantFamily'],
): CiaActionDecision['variantFamily'] {
  if (type === 'PAYMENT_RECOVERY') {
    return 'payment_recovery';
  }
  if (type === 'FOLLOWUP_SOFT' || type === 'FOLLOWUP_URGENT') {
    return 'followup';
  }
  return selectedVariantFamily;
}

function applyGovernor(selected: ActionOption, candidate: CiaCandidate): CiaActionDecision {
  const state = candidate.cognitiveState;
  const { type, governor, reason } = resolveGovernorVerdict(selected, state);
  const tacticPlan = buildConversationTacticPlan({ action: type, state });

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
    variantFamily: resolveVariantFamily(type, selected.variantFamily),
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

function buildDecisionSelection(
  candidate: CiaCandidate,
  strategy: CiaStrategyHints | null | undefined,
): {
  selectedDecision: CiaActionDecision;
  actionUniverse: ConversationActionCandidate[];
} {
  const options = buildOptions(candidate).sort((left, right) => {
    return actionUtility(right, strategy) - actionUtility(left, strategy);
  });
  const selected = options[0] || option('WAIT', 'timing_hold', 0.1, 0.01, 0.5);
  const selectedDecision = applyGovernor(selected, candidate);
  const bestUtility = actionUtility(selected, strategy);
  const actionUniverse = buildActionUniverse(options, candidate, strategy, bestUtility);
  return { selectedDecision, actionUniverse };
}

function decorateDecisionWithUniverse(
  selectedDecision: CiaActionDecision,
  actionUniverse: ConversationActionCandidate[],
): CiaActionDecision {
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

function toDecision(
  candidate: CiaCandidate,
  strategy?: CiaStrategyHints | null,
): CiaActionDecision {
  const { selectedDecision, actionUniverse } = buildDecisionSelection(candidate, strategy);
  return decorateDecisionWithUniverse(selectedDecision, actionUniverse);
}

/** Evaluate cia candidate. */
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
    if (chosen.has(key)) {
      continue;
    }
    const decision = toDecision(candidate, strategy);
    if (decision.type === 'WAIT') {
      continue;
    }
    chosen.set(key, decision);
    return decision;
  }
  return null;
}

const ACTION_LABELS: Partial<Record<CiaActionType, string>> = {
  RESPOND: 'resposta',
  ASK_CLARIFYING: 'pergunta de qualificação',
  SOCIAL_PROOF: 'prova social',
  OFFER: 'oferta',
  FOLLOWUP_SOFT: 'follow-up leve',
  FOLLOWUP_URGENT: 'follow-up urgente',
  PAYMENT_RECOVERY: 'recuperação de pagamento',
  ESCALATE_HUMAN: 'escalada humana',
};

function actionLabel(action: CiaActionType) {
  return ACTION_LABELS[action] || 'ação';
}

function resolveMaxActions(
  maxActionsPerCycle: number | undefined,
  strategy: CiaStrategyHints | null,
): number {
  const base = Number(maxActionsPerCycle || 5) || 5;
  let adjusted = base;
  if (strategy?.aggressiveness === 'HIGH') {
    adjusted = base + 1;
  } else if (strategy?.aggressiveness === 'LOW') {
    adjusted = base - 1;
  }
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
    if (actions.length >= maxActions) {
      break;
    }
    const key = decision.contactId || decision.phone || decision.conversationId;
    if (chosen.has(key)) {
      continue;
    }
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

/** Plan cia actions. */
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
  if (hot) {
    actions.push(hot);
  }

  const payment = takeBest(state.clusters.PAYMENT, chosen, strategy);
  if (payment) {
    actions.push(payment);
  }

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

/** Summarize decision cognition. */
export function summarizeDecisionCognition(decision: CiaActionDecision) {
  return `${actionLabel(decision.type)} • ${decision.cognitiveState.summary}`;
}
