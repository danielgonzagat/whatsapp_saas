import type { CiaDecisionBatch } from "./brain";
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

const VALID_TYPES = new Set(["RESPOND", "FOLLOWUP", "PAYMENT_RECOVERY"]);

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
      (action) => action.cluster === "HOT" || action.type === "RESPOND",
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
