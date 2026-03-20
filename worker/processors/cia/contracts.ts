import {
  evaluateCiaCandidate,
  type CiaDecisionBatch,
  type CiaGovernorVerdict,
  type CiaStrategyHints,
} from "./brain";
import type { CiaWorkspaceState } from "./build-state";

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
  | "DISPATCHED_FOR_EXECUTION"
  | "DEFERRED_BY_CYCLE_BUDGET"
  | "DEFERRED_BY_RULE";

export type CiaExhaustionGate =
  | "NONE"
  | "TIMING"
  | "HUMAN_REVIEW"
  | "CLARIFICATION"
  | "EXECUTABLE"
  | "ORPHAN_SELECTED_ACTION";

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
  "RESPOND",
  "ASK_CLARIFYING",
  "SOCIAL_PROOF",
  "OFFER",
  "FOLLOWUP_SOFT",
  "FOLLOWUP_URGENT",
  "PAYMENT_RECOVERY",
  "ESCALATE_HUMAN",
]);

function targetKey(action: { contactId?: string; phone?: string; conversationId: string }) {
  return String(action.contactId || action.phone || action.conversationId);
}

export function buildCiaGuaranteeReport(
  state: CiaWorkspaceState,
  batch: CiaDecisionBatch,
  maxActions: number,
): CiaGuaranteeReport {
  const selectedTargets = batch.actions.map(targetKey);
  const uniqueTargets = new Set(selectedTargets).size === selectedTargets.length;
  const prioritiesMonotonic = batch.actions.every((action, index, list) =>
    index === 0 ? true : list[index - 1].priority >= action.priority,
  );
  const maxActionsRespected = batch.actions.length <= maxActions;
  const paymentExists = state.clusters.PAYMENT.length > 0;
  const hotExists = state.clusters.HOT.length > 0;
  const paymentCovered =
    !paymentExists || batch.actions.some((action) => action.type === "PAYMENT_RECOVERY");
  const hotCovered =
    !hotExists ||
    batch.actions.some(
      (action) =>
        action.cluster === "HOT" ||
        ["RESPOND", "ASK_CLARIFYING", "SOCIAL_PROOF", "OFFER"].includes(
          action.type,
        ),
    );
  const actionTypesValid = batch.actions.every((action) => VALID_TYPES.has(action.type));
  const explicitOutcomeNarrated =
    typeof batch.summary === "string" &&
    batch.summary.trim().length > 0 &&
    (batch.actions.length > 0 || batch.summary.toLowerCase().includes("não encontrei"));

  const guaranteed =
    maxActionsRespected &&
    uniqueTargets &&
    prioritiesMonotonic &&
    paymentCovered &&
    hotCovered &&
    actionTypesValid &&
    explicitOutcomeNarrated;

  return {
    maxActionsRespected,
    uniqueTargets,
    prioritiesMonotonic,
    paymentCovered,
    hotCovered,
    actionTypesValid,
    explicitOutcomeNarrated,
    guaranteed,
    details: {
      selectedCount: batch.actions.length,
      candidateCount: state.candidates.length,
      maxActions,
      selectedTargets,
    },
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
  const classifications = state.candidates.map((candidate) => {
    const decision = evaluateCiaCandidate(candidate, strategy);
    const selected = selectedConversationIds.has(String(candidate.conversationId));

    let disposition: CiaExhaustionDisposition;
    let gate: CiaExhaustionGate;

    if (selected) {
      disposition = "DISPATCHED_FOR_EXECUTION";
      gate = "NONE";
    } else if (decision.governor === "WAIT") {
      disposition = "DEFERRED_BY_RULE";
      gate = "TIMING";
    } else if (decision.governor === "ESCALATE") {
      disposition = "DEFERRED_BY_CYCLE_BUDGET";
      gate = "HUMAN_REVIEW";
    } else if (decision.governor === "ASK") {
      disposition = "DEFERRED_BY_CYCLE_BUDGET";
      gate = "CLARIFICATION";
    } else {
      disposition = "DEFERRED_BY_CYCLE_BUDGET";
      gate = "EXECUTABLE";
    }

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

  const orphanSelectedConversationIds = batch.actions
    .map((action) => String(action.conversationId))
    .filter((conversationId) => !candidateConversationIds.has(conversationId));

  const dispatchableCount = classifications.filter(
    (item) => item.governor !== "WAIT",
  ).length;
  const dispatchedCount = classifications.filter(
    (item) => item.disposition === "DISPATCHED_FOR_EXECUTION",
  ).length;
  const deferredByBudgetCount = classifications.filter(
    (item) => item.disposition === "DEFERRED_BY_CYCLE_BUDGET",
  ).length;
  const deferredByRuleCount = classifications.filter(
    (item) => item.disposition === "DEFERRED_BY_RULE",
  ).length;
  const waitingTimingCount = classifications.filter(
    (item) => item.gate === "TIMING",
  ).length;
  const waitingHumanCount = classifications.filter(
    (item) => item.gate === "HUMAN_REVIEW",
  ).length;
  const waitingClarificationCount = classifications.filter(
    (item) => item.gate === "CLARIFICATION",
  ).length;
  const coveredCount = classifications.length;
  const silentCount = Math.max(state.candidates.length - coveredCount, 0);
  const noLegalActions = dispatchableCount === 0;
  const selectedCount = batch.actions.length;
  const dispatchCoverageValid =
    dispatchedCount === Math.min(maxActions, dispatchableCount);
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
    dispatchableCount,
    dispatchedCount,
    deferredByBudgetCount,
    deferredByRuleCount,
    waitingTimingCount,
    waitingHumanCount,
    waitingClarificationCount,
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

export function assertCiaGuarantees(
  report: CiaGuaranteeReport,
): CiaGuaranteeReport {
  if (report.guaranteed) return report;

  const failed = [
    report.maxActionsRespected ? null : "max_actions",
    report.uniqueTargets ? null : "duplicate_target",
    report.prioritiesMonotonic ? null : "priority_order",
    report.paymentCovered ? null : "payment_not_covered",
    report.hotCovered ? null : "hot_not_covered",
    report.actionTypesValid ? null : "invalid_action_type",
    report.explicitOutcomeNarrated ? null : "silent_summary",
  ].filter(Boolean);

  throw new Error(`cia_contract_violation:${failed.join(",")}`);
}

export function assertCiaExhaustion(
  report: CiaExhaustionReport,
): CiaExhaustionReport {
  if (report.exhaustive) return report;

  const failed = [
    report.silentCount === 0 ? null : "silent_candidates",
    report.orphanSelectedCount === 0 ? null : "orphan_selected_actions",
    report.details.coveredCount === report.details.candidateCount
      ? null
      : "uncovered_candidates",
    report.dispatchedCount === Math.min(report.details.maxActions, report.dispatchableCount)
      ? null
      : "dispatch_coverage",
    report.noLegalActions ? (report.details.selectedCount === 0 ? null : "illegal_selected_in_idle") : null,
  ].filter(Boolean);

  throw new Error(`cia_exhaustion_violation:${failed.join(",")}`);
}
