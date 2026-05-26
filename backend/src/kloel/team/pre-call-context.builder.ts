/**
 * UTP-TEAM-001 — Pre-Call Context Builder
 *
 * Bundles relevant lead history, valence trace, and open questions
 * for an operator about to enter a conversation.
 *
 * Input: leadId, conversationId, workspaceId, events (from spine)
 * Output: PreCallContext with leadHistory, valenceTrace, openQuestions
 */

import type {
  LeadHistoryEntry,
  PreCallContext,
  PreCallContextInput,
  ValenceTraceEntry,
} from './team.types';
import type { SpineEventRef } from '../mind/mind.types';
import type { AbiValence } from '../abi/abi-schema';

const LEAD_RELEVANT_EVENTS: ReadonlySet<string> = new Set([
  'commerce.lead.created',
  'commerce.lead.contacted',
  'commerce.lead.replied',
  'commerce.lead.went_silent',
  'commerce.lead.objection_raised',
  'commerce.lead.qualified',
  'commerce.lead.converted',
  'commerce.lead.lost',
  'commerce.whatsapp.message_received',
  'commerce.whatsapp.message_replied',
  'commerce.whatsapp.handoff_to_human',
  'commerce.whatsapp.conversation_resumed',
  'commerce.crm.stage_changed',
  'commerce.crm.owner_assigned',
  'commerce.crm.next_step_defined',
  'commerce.payment.approved',
  'commerce.payment.declined',
  'commerce.cart.abandoned',
  'commerce.post_sale.churn_risk_detected',
]);

const MAX_HISTORY_ENTRIES = 20;
const VALENCE_WEIGHT_POSITIVE = 0.7;
const VALENCE_WEIGHT_NEGATIVE = 0.5;
const VALENCE_WEIGHT_NEUTRAL = 0.2;
const VALENCE_WEIGHT_AMBIGUOUS = 0.3;

function parseTimestampMs(iso: string): number {
  return new Date(iso).getTime();
}

function filterByLead(
  events: readonly SpineEventRef[],
  leadId: string,
): readonly SpineEventRef[] {
  return events.filter(
    (e) =>
      e.entityRef?.entityType === 'lead' &&
      e.entityRef.entityId === leadId,
  );
}

function normalizeValence(
  raw: SpineEventRef['valence'],
): AbiValence | undefined {
  if (raw === undefined) {return undefined;}
  return raw;
}

function eventSummary(event: SpineEventRef): string {
  const entityId = event.entityRef?.entityId ?? '-';
  const name = event.eventName;
  return `${name} id=${entityId}`;
}

function valenceWeight(v: AbiValence): number {
  switch (v) {
    case 'positive':
      return VALENCE_WEIGHT_POSITIVE;
    case 'negative':
      return VALENCE_WEIGHT_NEGATIVE;
    case 'neutral':
      return VALENCE_WEIGHT_NEUTRAL;
    case 'ambiguous':
      return VALENCE_WEIGHT_AMBIGUOUS;
  }
}

function findOpenQuestions(events: readonly SpineEventRef[]): readonly string[] {
  const questions: string[] = [];

  const replied = events.some(
    (e) =>
      e.eventName === 'commerce.whatsapp.message_replied' ||
      e.eventName === 'commerce.lead.replied',
  );
  if (!replied && events.some((e) => e.eventName === 'commerce.lead.contacted')) {
    questions.push('lead has not replied to initial contact');
  }

  const silent = events.some((e) => e.eventName === 'commerce.lead.went_silent');
  if (silent) {
    const hasObjection = events.some(
      (e) => e.eventName === 'commerce.lead.objection_raised',
    );
    const hasCartAbandoned = events.some(
      (e) => e.eventName === 'commerce.cart.abandoned',
    );

    if (hasObjection) {
      questions.push(
        'lead went silent after raising objection - re-engagement requires understanding of unresolved concern',
      );
    } else if (hasCartAbandoned) {
      questions.push(
        'lead went silent after abandoning cart - re-engagement requires understanding of purchase hesitation',
      );
    } else {
      questions.push(
        'lead entered silent state without clear context - review timeline before assuming disinterest',
      );
    }
  }

  const objection = events.some((e) => e.eventName === 'commerce.lead.objection_raised');
  if (objection) {
    questions.push('lead raised objection - resolution pending');
  }

  const hasStageChange = events.some((e) => e.eventName === 'commerce.crm.stage_changed');
  const hasNextStep = events.some((e) => e.eventName === 'commerce.crm.next_step_defined');
  if (hasStageChange && !hasNextStep) {
    questions.push('stage changed but no next step defined');
  }

  const hasPayment = events.some((e) => e.eventName === 'commerce.payment.approved');
  if (hasPayment) {
    questions.push('payment completed - verify onboarding/delivery status');
  }

  const hasChurnRisk = events.some(
    (e) => e.eventName === 'commerce.post_sale.churn_risk_detected',
  );
  if (hasChurnRisk) {
    questions.push(
      'post-sale churn risk flagged - confirm whether customer reached first value before every retention action; human review only',
    );
  }

  return questions;
}

function findCurrentStage(events: readonly SpineEventRef[]): string | undefined {
  const stageEvents = events
    .filter((e) => e.eventName === 'commerce.crm.stage_changed')
    .sort(
      (a, b) => parseTimestampMs(b.occurredAt) - parseTimestampMs(a.occurredAt),
    );

  if (stageEvents.length > 0) {
    const last = stageEvents[0]!;
    const payload = last.payload as Record<string, unknown> | undefined;
    return (payload?.['toStage'] as string) ?? (payload?.['stage'] as string) ?? undefined;
  }
  return undefined;
}

function findLastContact(events: readonly SpineEventRef[]): string | undefined {
  const contactEvents = events.filter(
    (e) =>
      e.eventName === 'commerce.whatsapp.message_replied' ||
      e.eventName === 'commerce.lead.contacted',
  );
  if (contactEvents.length === 0) {return undefined;}

  return contactEvents.reduce((latest, e) =>
    parseTimestampMs(e.occurredAt) > parseTimestampMs(latest.occurredAt) ? e : latest,
  ).occurredAt;
}

export function buildPreCallContext(input: PreCallContextInput): PreCallContext {
  const leadEvents = filterByLead(input.events, input.leadId);

  const sorted = [...leadEvents].sort(
    (a, b) => parseTimestampMs(b.occurredAt) - parseTimestampMs(a.occurredAt),
  );

  const relevant = sorted.filter((e) => LEAD_RELEVANT_EVENTS.has(e.eventName));

  const history: LeadHistoryEntry[] = relevant.slice(0, MAX_HISTORY_ENTRIES).map(
    (e): LeadHistoryEntry => {
      const valence = e.valence !== undefined ? normalizeValence(e.valence) : undefined;
      const result: LeadHistoryEntry = {
        eventId: e.eventId,
        eventName: e.eventName,
        occurredAt: e.occurredAt,
        summary: eventSummary(e),
      };
      if (valence !== undefined) {
        return { ...result, valence };
      }
      return result;
    },
  );

  const valenceTrace: ValenceTraceEntry[] = relevant
    .filter((e) => e.valence !== undefined)
    .map((e): ValenceTraceEntry => ({
      eventId: e.eventId,
      valence: normalizeValence(e.valence)!,
      weight: valenceWeight(normalizeValence(e.valence)!),
      occurredAt: e.occurredAt,
    }));

  const openQuestions = findOpenQuestions(leadEvents);
  const currentStage = findCurrentStage(leadEvents);
  const lastContactAt = findLastContact(leadEvents);

  return {
    leadId: input.leadId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
    leadHistory: history,
    valenceTrace,
    openQuestions,
    ...(currentStage !== undefined ? { currentStage } : {}),
    ...(lastContactAt !== undefined ? { lastContactAt } : {}),
    assembledAt: input.nowIso ?? new Date().toISOString(),
  };
}
