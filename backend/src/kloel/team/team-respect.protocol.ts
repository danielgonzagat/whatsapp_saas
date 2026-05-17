/**
 * UTP-TEAM-006 — Team Respect Protocol
 *
 * Rules for suggestion-not-command framing. Every suggestion presented
 * to an operator can be dismissed or overridden without punishment.
 *
 * Pure functions — no DI, no side effects.
 */

import type {
  NextBestAction,
  SuggestionDismissal,
  OperatorAction,
  TeamDelegationRiskClass,
  TeamDelegationMode,
  TeamRollbackAction,
  LeadOutcomeGuardrail,
} from './team.types';

const SUGGESTION_FRAME_PREFIX =
  'suggestion (not command): operator may dismiss or override at all times';

export function formatSuggestionForDisplay(
  suggestion: NextBestAction,
): string {
  return `[#${suggestion.rank}] ${suggestion.action}: ${suggestion.rationale} ` +
    `(confidence: ${(suggestion.confidence * 100).toFixed(0)}%)`;
}

export interface SuggestionMessage {
  readonly frame: string;
  readonly action: string;
  readonly rationale: string;
  readonly guardrails: readonly string[];
  readonly dismissible: boolean;
  readonly delegation: {
    readonly riskClass: TeamDelegationRiskClass;
    readonly delegationMode: TeamDelegationMode;
    readonly safeNextStep: string;
    readonly rollback: readonly TeamRollbackAction[];
    readonly leadOutcomeGuardrail: LeadOutcomeGuardrail;
  };
}

export function buildSuggestionMessage(
  suggestion: NextBestAction,
): SuggestionMessage {
  return {
    frame: SUGGESTION_FRAME_PREFIX,
    action: suggestion.action,
    rationale: suggestion.rationale,
    guardrails: suggestion.guardrails,
    dismissible: true,
    delegation: {
      riskClass: suggestion.r1Contract.riskClass,
      delegationMode: suggestion.r1Contract.delegationMode,
      safeNextStep: suggestion.r1Contract.safeNextStep,
      rollback: suggestion.r1Contract.rollback,
      leadOutcomeGuardrail: suggestion.r1Contract.leadOutcomeGuardrail,
    },
  };
}

export function validateSuggestionDismissal(
  _suggestion: NextBestAction,
  dismissal: SuggestionDismissal,
): { readonly valid: boolean; readonly reason: string } {
  if (!dismissal.operatorId) {
    return { valid: false, reason: 'operatorId required for dismissal' };
  }

  if (!isValidOperatorAction(dismissal.action)) {
    return {
      valid: false,
      reason: `action must be one of: dismiss, accept, override, snooze`,
    };
  }

  return { valid: true, reason: 'dismissal accepted' };
}

function isValidOperatorAction(action: string): action is OperatorAction {
  return ['dismiss', 'accept', 'override', 'snooze'].includes(action);
}

export function isOperatorOverrideAllowed(): true {
  return true;
}

export function buildSuggestionId(
  operatorId: string,
  suggestionRank: number,
  timestamp: string,
): string {
  const ts = timestamp.replace(/[:.]/g, '').slice(0, 15);
  return `sugg_${operatorId}_${suggestionRank}_${ts}`;
}

export const TEAM_RESPECT_RULES: ReadonlySet<string> = new Set([
  'every suggestion includes explicit dismiss/override path',
  'operator dismissal carries zero penalty',
  'operator override is always accepted without justification',
  'suggestions are framed as optional, not mandatory',
  'no tracking of dismissal count for performance evaluation',
  'silent dismissal (no response) is treated as valid rejection',
]);
