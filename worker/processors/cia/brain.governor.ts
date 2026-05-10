import type { CiaActionType, CiaCandidate } from './build-state';
import type { CustomerCognitiveState } from './cognitive-state';
import { buildConversationTacticPlan } from './conversation-tactics';
import type {
  ActionOption,
  CiaActionDecision,
  CiaGovernorVerdict,
  CiaStrategyHints,
  ConversationActionCandidate,
} from './brain.types';
import { actionUtility, buildOptions, option } from './brain.options';

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
