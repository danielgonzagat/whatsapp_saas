import {
  type CiaDecisionBatch,
  type CiaGovernorVerdict,
  type CiaStrategyHints,
  evaluateCiaCandidate,
} from './brain';
import type { CiaWorkspaceState } from './build-state';

export interface CiaGuaranteeReport {
  maxActionsRespected: boolean;
  uniqueTargets: boolean;
  prioritiesMonotonic: boolean;
  paymentCovered: boolean;
  hotCovered: boolean;
  actionTypesValid: boolean;
  explicitOutcomeNarrated: boolean;
  guaranteed: boolean;
  details: {
    selectedCount: number;
    candidateCount: number;
    maxActions: number;
    selectedTargets: string[];
  };
}

export type CiaExhaustionDisposition =
  | 'DISPATCHED_FOR_EXECUTION'
  | 'DEFERRED_BY_CYCLE_BUDGET'
  | 'DEFERRED_BY_RULE';

export type CiaExhaustionGate =
  | 'NONE'
  | 'TIMING'
  | 'HUMAN_REVIEW'
  | 'CLARIFICATION'
  | 'EXECUTABLE'
  | 'ORPHAN_SELECTED_ACTION';

export interface CiaCandidateExhaustionRecord {
  conversationId: string;
  contactId?: string;
  phone?: string;
  cluster: string;
  plannedType: string;
  selectedActionUtility: number;
  selectedActionRank: number;
  betterActionCount: number;
  betterExecutableActionCount: number;
  nextBestActionType: string | null;
  nextBestActionUtility: number | null;
  selectedTactic: string | null;
  selectedTacticUtility: number | null;
  selectedTacticRank: number | null;
  betterTacticCount: number;
  nextBestTactic: string | null;
  nextBestTacticUtility: number | null;
  tacticCandidateCount: number;
  governor: CiaGovernorVerdict;
  disposition: CiaExhaustionDisposition;
  gate: CiaExhaustionGate;
  selected: boolean;
  priority: number;
  reason: string;
}

export interface CiaExhaustionReport {
  exhaustive: boolean;
  noLegalActions: boolean;
  silentCount: number;
  dispatchableCount: number;
  dispatchedCount: number;
  deferredByBudgetCount: number;
  deferredByRuleCount: number;
  waitingTimingCount: number;
  waitingHumanCount: number;
  waitingClarificationCount: number;
  orphanSelectedCount: number;
  details: {
    candidateCount: number;
    selectedCount: number;
    maxActions: number;
    coveredCount: number;
    orphanSelectedConversationIds: string[];
    classifications: CiaCandidateExhaustionRecord[];
  };
}

const VALID_TYPES = new Set([
  'RESPOND',
  'ASK_CLARIFYING',
  'SOCIAL_PROOF',
  'OFFER',
  'FOLLOWUP_SOFT',
  'FOLLOWUP_URGENT',
  'PAYMENT_RECOVERY',
  'ESCALATE_HUMAN',
]);

function targetKey(action: { contactId?: string; phone?: string; conversationId: string }) {
  return String(action.contactId || action.phone || action.conversationId);
}

const HOT_COVER_TYPES = new Set(['RESPOND', 'ASK_CLARIFYING', 'SOCIAL_PROOF', 'OFFER']);

function arePrioritiesMonotonic(actions: CiaDecisionBatch['actions']): boolean {
  return actions.every((action, index, list) =>
    index === 0 ? true : list[index - 1].priority >= action.priority,
  );
}

function isPaymentCovered(state: CiaWorkspaceState, batch: CiaDecisionBatch): boolean {
  if (state.clusters.PAYMENT.length === 0) {
    return true;
  }
  return batch.actions.some((action) => action.type === 'PAYMENT_RECOVERY');
}

function isHotCovered(state: CiaWorkspaceState, batch: CiaDecisionBatch): boolean {
  if (state.clusters.HOT.length === 0) {
    return true;
  }
  return batch.actions.some(
    (action) => action.cluster === 'HOT' || HOT_COVER_TYPES.has(action.type),
  );
}

const isExplicitOutcomeNarrated = (batch: CiaDecisionBatch): boolean => {
  if (typeof batch.summary !== 'string' || batch.summary.trim().length === 0) {
    return false;
  }
  if (batch.actions.length > 0) {
    return true;
  }
  return batch.summary.toLowerCase().includes('não encontrei');
};

interface GuaranteeChecks {
  selectedTargets: string[];
  uniqueTargets: boolean;
  prioritiesMonotonic: boolean;
  maxActionsRespected: boolean;
  paymentCovered: boolean;
  hotCovered: boolean;
  actionTypesValid: boolean;
  explicitOutcomeNarrated: boolean;
}

const evaluateGuaranteeChecks = (
  state: CiaWorkspaceState,
  batch: CiaDecisionBatch,
  maxActions: number,
): GuaranteeChecks => {
  const selectedTargets = batch.actions.map(targetKey);
  return {
    selectedTargets,
    uniqueTargets: new Set(selectedTargets).size === selectedTargets.length,
    prioritiesMonotonic: arePrioritiesMonotonic(batch.actions),
    maxActionsRespected: batch.actions.length <= maxActions,
    paymentCovered: isPaymentCovered(state, batch),
    hotCovered: isHotCovered(state, batch),
    actionTypesValid: batch.actions.every((action) => VALID_TYPES.has(action.type)),
    explicitOutcomeNarrated: isExplicitOutcomeNarrated(batch),
  };
};

const allChecksPass = (checks: GuaranteeChecks): boolean =>
  checks.maxActionsRespected &&
  checks.uniqueTargets &&
  checks.prioritiesMonotonic &&
  checks.paymentCovered &&
  checks.hotCovered &&
  checks.actionTypesValid &&
  checks.explicitOutcomeNarrated;

export function buildCiaGuaranteeReport(
  state: CiaWorkspaceState,
  batch: CiaDecisionBatch,
  maxActions: number,
): CiaGuaranteeReport {
  const checks = evaluateGuaranteeChecks(state, batch, maxActions);
  return {
    maxActionsRespected: checks.maxActionsRespected,
    uniqueTargets: checks.uniqueTargets,
    prioritiesMonotonic: checks.prioritiesMonotonic,
    paymentCovered: checks.paymentCovered,
    hotCovered: checks.hotCovered,
    actionTypesValid: checks.actionTypesValid,
    explicitOutcomeNarrated: checks.explicitOutcomeNarrated,
    guaranteed: allChecksPass(checks),
    details: {
      selectedCount: batch.actions.length,
      candidateCount: state.candidates.length,
      maxActions,
      selectedTargets: checks.selectedTargets,
    },
  };
}

function classifyDecisionGate(
  selected: boolean,
  governor: CiaGovernorVerdict,
): { disposition: CiaExhaustionDisposition; gate: CiaExhaustionGate } {
  if (selected) {
    return { disposition: 'DISPATCHED_FOR_EXECUTION', gate: 'NONE' };
  }
  if (governor === 'WAIT') {
    return { disposition: 'DEFERRED_BY_RULE', gate: 'TIMING' };
  }
  if (governor === 'ESCALATE') {
    return { disposition: 'DEFERRED_BY_CYCLE_BUDGET', gate: 'HUMAN_REVIEW' };
  }
  if (governor === 'ASK') {
    return { disposition: 'DEFERRED_BY_CYCLE_BUDGET', gate: 'CLARIFICATION' };
  }
  return { disposition: 'DEFERRED_BY_CYCLE_BUDGET', gate: 'EXECUTABLE' };
}

function buildClassifications(
  state: CiaWorkspaceState,
  selectedConversationIds: Set<string>,
  strategy?: CiaStrategyHints | null,
): CiaCandidateExhaustionRecord[] {
  return state.candidates.map((candidate) => {
    const decision = evaluateCiaCandidate(candidate, strategy);
    const selected = selectedConversationIds.has(String(candidate.conversationId));
    const { disposition, gate } = classifyDecisionGate(selected, decision.governor);

    return {
      conversationId: candidate.conversationId,
      contactId: candidate.contactId,
      phone: candidate.phone,
      cluster: candidate.cluster,
      plannedType: decision.type,
      selectedActionUtility: decision.selectedActionUtility,
      selectedActionRank: decision.selectedActionRank,
      betterActionCount: decision.betterActionCount,
      betterExecutableActionCount: decision.betterExecutableActionCount,
      nextBestActionType: decision.nextBestActionType,
      nextBestActionUtility: decision.nextBestActionUtility,
      selectedTactic: decision.conversationTactic || null,
      selectedTacticUtility: decision.selectedTacticUtility,
      selectedTacticRank: decision.selectedTacticRank,
      betterTacticCount: decision.betterTacticCount,
      nextBestTactic: decision.nextBestTactic,
      nextBestTacticUtility: decision.nextBestTacticUtility,
      tacticCandidateCount: decision.conversationTacticUniverse.length,
      governor: decision.governor,
      disposition,
      gate,
      selected,
      priority: decision.priority,
      reason: decision.reason,
    } satisfies CiaCandidateExhaustionRecord;
  });
}

interface ExhaustionAggregate {
  dispatchableCount: number;
  dispatchedCount: number;
  deferredByBudgetCount: number;
  deferredByRuleCount: number;
  waitingTimingCount: number;
  waitingHumanCount: number;
  waitingClarificationCount: number;
}

function aggregateClassifications(
  classifications: CiaCandidateExhaustionRecord[],
): ExhaustionAggregate {
  return {
    dispatchableCount: classifications.filter((item) => item.governor !== 'WAIT').length,
    dispatchedCount: classifications.filter(
      (item) => item.disposition === 'DISPATCHED_FOR_EXECUTION',
    ).length,
    deferredByBudgetCount: classifications.filter(
      (item) => item.disposition === 'DEFERRED_BY_CYCLE_BUDGET',
    ).length,
    deferredByRuleCount: classifications.filter((item) => item.disposition === 'DEFERRED_BY_RULE')
      .length,
    waitingTimingCount: classifications.filter((item) => item.gate === 'TIMING').length,
    waitingHumanCount: classifications.filter((item) => item.gate === 'HUMAN_REVIEW').length,
    waitingClarificationCount: classifications.filter((item) => item.gate === 'CLARIFICATION')
      .length,
  };
}

export function buildCiaExhaustionReport(
  state: CiaWorkspaceState,
  batch: CiaDecisionBatch,
  maxActions: number,
  strategy?: CiaStrategyHints | null,
): CiaExhaustionReport {
  const selectedConversationIds = new Set(
    batch.actions.map((action) => String(action.conversationId)),
  );
  const candidateConversationIds = new Set(
    state.candidates.map((candidate) => String(candidate.conversationId)),
  );
  const classifications = buildClassifications(state, selectedConversationIds, strategy);

  const orphanSelectedConversationIds = batch.actions
    .map((action) => String(action.conversationId))
    .filter((conversationId) => !candidateConversationIds.has(conversationId));

  const aggregate = aggregateClassifications(classifications);
  const coveredCount = classifications.length;
  const silentCount = Math.max(state.candidates.length - coveredCount, 0);
  const noLegalActions = aggregate.dispatchableCount === 0;
  const selectedCount = batch.actions.length;
  const dispatchCoverageValid =
    aggregate.dispatchedCount === Math.min(maxActions, aggregate.dispatchableCount);
  const exhaustive =
    silentCount === 0 &&
    orphanSelectedConversationIds.length === 0 &&
    coveredCount === state.candidates.length &&
    dispatchCoverageValid &&
    (noLegalActions ? selectedCount === 0 : true);

  return {
    exhaustive,
    noLegalActions,
    silentCount,
    dispatchableCount: aggregate.dispatchableCount,
    dispatchedCount: aggregate.dispatchedCount,
    deferredByBudgetCount: aggregate.deferredByBudgetCount,
    deferredByRuleCount: aggregate.deferredByRuleCount,
    waitingTimingCount: aggregate.waitingTimingCount,
    waitingHumanCount: aggregate.waitingHumanCount,
    waitingClarificationCount: aggregate.waitingClarificationCount,
    orphanSelectedCount: orphanSelectedConversationIds.length,
    details: {
      candidateCount: state.candidates.length,
      selectedCount,
      maxActions,
      coveredCount,
      orphanSelectedConversationIds,
      classifications,
    },
  };
}

const GUARANTEE_FAILURE_CODES: Array<{ flag: keyof CiaGuaranteeReport; code: string }> = [
  { flag: 'maxActionsRespected', code: 'max_actions' },
  { flag: 'uniqueTargets', code: 'duplicate_target' },
  { flag: 'prioritiesMonotonic', code: 'priority_order' },
  { flag: 'paymentCovered', code: 'payment_not_covered' },
  { flag: 'hotCovered', code: 'hot_not_covered' },
  { flag: 'actionTypesValid', code: 'invalid_action_type' },
  { flag: 'explicitOutcomeNarrated', code: 'silent_summary' },
];

function collectGuaranteeFailures(report: CiaGuaranteeReport): string[] {
  return GUARANTEE_FAILURE_CODES.filter((item) => !report[item.flag]).map((item) => item.code);
}

export function assertCiaGuarantees(report: CiaGuaranteeReport): CiaGuaranteeReport {
  if (report.guaranteed) {
    return report;
  }
  const failed = collectGuaranteeFailures(report);
  throw new Error(`cia_contract_violation:${failed.join(',')}`);
}

export function assertCiaExhaustion(report: CiaExhaustionReport): CiaExhaustionReport {
  if (report.exhaustive) {
    return report;
  }

  const failed = [
    report.silentCount === 0 ? null : 'silent_candidates',
    report.orphanSelectedCount === 0 ? null : 'orphan_selected_actions',
    report.details.coveredCount === report.details.candidateCount ? null : 'uncovered_candidates',
    report.dispatchedCount === Math.min(report.details.maxActions, report.dispatchableCount)
      ? null
      : 'dispatch_coverage',
    report.noLegalActions
      ? report.details.selectedCount === 0
        ? null
        : 'illegal_selected_in_idle'
      : null,
  ].filter(Boolean);

  throw new Error(`cia_exhaustion_violation:${failed.join(',')}`);
}
