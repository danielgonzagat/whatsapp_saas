/**
 * UTP-TEAM-003 — Forgotten-Followup Rescuer
 *
 * Scans spine for leads in silent state past budget without operator
 * action. Returns ranked list of forgotten followups by urgency.
 *
 * Default budget: 72 hours. Configurable per call.
 */

import type {
  ForgottenFollowup,
  ForgottenFollowupInput,
  SuggestionR1Contract,
} from './team.types';
import type { SpineEventRef } from '../mind/mind.types';

const DEFAULT_BUDGET_HOURS = 72;
const URGENCY_HIGH_FACTOR = 1.5;
const URGENCY_MEDIUM_FACTOR = 1.0;

function parseTimestampMs(iso: string): number {
  return new Date(iso).getTime();
}

function hoursBetween(earlier: string, later: string): number {
  const ms = new Date(later).getTime() - new Date(earlier).getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

interface LeadSilentEntry {
  readonly leadId: string;
  readonly silentAt: string;
  readonly workspaceId: string;
}

function collectSilentLeads(
  events: readonly SpineEventRef[],
  workspaceId: string,
): readonly LeadSilentEntry[] {
  const silentMap = new Map<string, string>();

  for (const event of events) {
    if (event.eventName !== 'commerce.lead.went_silent') continue;
    if (event.workspaceId !== workspaceId) continue;

    const leadId = event.entityRef?.entityId;
    if (!leadId) continue;

    const existing = silentMap.get(leadId);
    if (
      existing === undefined ||
      parseTimestampMs(event.occurredAt) > parseTimestampMs(existing)
    ) {
      silentMap.set(leadId, event.occurredAt);
    }
  }

  return Array.from(silentMap.entries()).map(([leadId, silentAt]) => ({
    leadId,
    silentAt,
    workspaceId,
  }));
}

function findLastOperatorAction(
  events: readonly SpineEventRef[],
  leadId: string,
): string | undefined {
  const operatorEvents = events.filter(
    (e) =>
      e.entityRef?.entityType === 'lead' &&
      e.entityRef.entityId === leadId &&
      (e.eventName === 'commerce.whatsapp.message_replied' ||
        e.eventName === 'commerce.lead.contacted' ||
        e.eventName === 'commerce.whatsapp.handoff_to_human' ||
        e.eventName === 'commerce.crm.next_step_defined'),
  );

  if (operatorEvents.length === 0) return undefined;

  return operatorEvents.reduce((latest, e) =>
    parseTimestampMs(e.occurredAt) > parseTimestampMs(latest.occurredAt)
      ? e
      : latest,
  ).occurredAt;
}

function hasQualifiedSilenceContext(
  events: readonly SpineEventRef[],
  leadId: string,
  silentAt: string,
): boolean {
  const silentAtMs = parseTimestampMs(silentAt);
  return events.some(
    (e) =>
      e.entityRef?.entityType === 'lead' &&
      e.entityRef.entityId === leadId &&
      parseTimestampMs(e.occurredAt) <= silentAtMs &&
      (e.eventName === 'commerce.lead.objection_raised' ||
        e.eventName === 'commerce.cart.abandoned'),
  );
}

function buildForgottenFollowupContract(
  qualifiedSilence: boolean,
): SuggestionR1Contract {
  return {
    riskClass: 'R1',
    delegationMode: 'allowed_alone',
    safeNextStep: qualifiedSilence
      ? 'surface an honest follow-up suggestion for owner review; do not send'
      : 'review timeline before suggesting any follow-up',
    rollback: ['dismiss_suggestion', 'snooze_suggestion'],
    leadOutcomeGuardrail: {
      antiPressureLanguage: true,
      respectsSilenceWindow: true,
      requiresContextQualification: !qualifiedSilence,
    },
  };
}

function computeUrgency(
  silentDurationHours: number,
  budgetHours: number,
): ForgottenFollowup['urgency'] {
  const ratio = silentDurationHours / budgetHours;
  if (ratio >= URGENCY_HIGH_FACTOR) return 'high';
  if (ratio >= URGENCY_MEDIUM_FACTOR) return 'medium';
  return 'low';
}

export function rescueForgottenFollowups(
  input: ForgottenFollowupInput,
): readonly ForgottenFollowup[] {
  const budgetHours = input.budgetHours ?? DEFAULT_BUDGET_HOURS;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const silentLeads = collectSilentLeads(input.events, input.workspaceId);

  const results: ForgottenFollowup[] = [];

  for (const entry of silentLeads) {
    const silentDurationHours = hoursBetween(entry.silentAt, nowIso);

    if (silentDurationHours < budgetHours) continue;

    const lastOperatorAction = findLastOperatorAction(
      input.events,
      entry.leadId,
    );

    if (lastOperatorAction !== undefined) {
      const sinceAction = hoursBetween(lastOperatorAction, nowIso);
      if (sinceAction < budgetHours * 0.5) continue;
    }

    const qualifiedSilence = hasQualifiedSilenceContext(
      input.events,
      entry.leadId,
      entry.silentAt,
    );

    results.push({
      leadId: entry.leadId,
      workspaceId: entry.workspaceId,
      silentAt: entry.silentAt,
      silentDurationHours: Math.round(silentDurationHours * 10) / 10,
      budgetHours,
      ...(lastOperatorAction !== undefined ? { lastOperatorActionAt: lastOperatorAction } : {}),
      urgency: computeUrgency(silentDurationHours, budgetHours),
      r1Contract: buildForgottenFollowupContract(qualifiedSilence),
    });
  }

  return results.sort((a, b) => {
    const ua = a.urgency === 'high' ? 3 : a.urgency === 'medium' ? 2 : 1;
    const ub = b.urgency === 'high' ? 3 : b.urgency === 'medium' ? 2 : 1;
    if (ub !== ua) return ub - ua;
    return b.silentDurationHours - a.silentDurationHours;
  });
}
