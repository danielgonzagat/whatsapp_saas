/**
 * UTP-OWNER-CRIT-001 — Decision Observer.
 *
 * Observes owner decisions from the spine: overrides, escalations,
 * rejections of system suggestions, autonomy grants, and revocations.
 *
 * Pure function — takes SpineEventRef[] and returns DecisionObservation[].
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../../mind/mind.types';
import type { DecisionKind, DecisionObservation, ObserverInput } from '../owner-criterion.types';

const MIN_EVENTS_FOR_OBSERVATION = 2;

interface DecisionSignal {
  readonly decisionKind: DecisionKind;
  readonly targetDomain: string;
  readonly eventId: string;
  readonly occurredAt: string;
}

function extractOverrides(events: readonly SpineEventRef[]): DecisionSignal[] {
  return events
    .filter((e) => e.eventName === 'commerce.crm.stage_changed')
    .map((e) => ({
      decisionKind: 'override' as DecisionKind,
      targetDomain: 'crm_pipeline',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
    }));
}

function extractEscalations(events: readonly SpineEventRef[]): DecisionSignal[] {
  return events
    .filter((e) => e.eventName === 'commerce.whatsapp.handoff_to_human')
    .map((e) => ({
      decisionKind: 'escalation' as DecisionKind,
      targetDomain: 'conversation',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
    }));
}

function extractRejections(events: readonly SpineEventRef[]): DecisionSignal[] {
  return events
    .filter((e) => e.eventName === 'commerce.lead.lost')
    .map((e) => ({
      decisionKind: 'rejection' as DecisionKind,
      targetDomain: 'lead_qualification',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
    }));
}

function extractAutonomyGrants(events: readonly SpineEventRef[]): DecisionSignal[] {
  return events
    .filter((e) => e.eventName === 'commerce.crm.owner_assigned')
    .filter((e) => {
      const payload = e.payload as Record<string, unknown> | undefined;
      return payload?.['assignedTo'] === 'autopilot';
    })
    .map((e) => ({
      decisionKind: 'autonomy_grant' as DecisionKind,
      targetDomain: 'crm_ownership',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
    }));
}

function buildObservation(
  workspaceId: string,
  decisionKind: DecisionKind,
  signals: readonly DecisionSignal[],
  nowMs: number,
): DecisionObservation {
  const targetDomain = signals[0]?.targetDomain ?? 'unknown';
  const evidenceEventIds = signals.map((s) => s.eventId);

  const alternatives: string[] = [];
  if (decisionKind === 'override') {
    alternatives.push('allow_system_default');
  }
  if (decisionKind === 'escalation') {
    alternatives.push('auto_reply');
  }
  if (decisionKind === 'rejection') {
    alternatives.push('qualify_lead');
    alternatives.push('nurture_lead');
  }
  if (decisionKind === 'autonomy_grant') {
    alternatives.push('keep_manual');
  }

  return {
    observationId: `dec_${randomUUID()}`,
    workspaceId,
    decisionKind,
    targetDomain,
    chosenAction: `${decisionKind}_${targetDomain}`,
    alternativesObserved: alternatives,
    observedAt: new Date(nowMs).toISOString(),
    evidenceEventIds,
    confidence: Math.min(0.95, 0.3 + signals.length * 0.15),
  };
}

/**
 * Observe owner decisions from spine events.
 *
 * Input: ObserverInput (events filtered by workspace + window)
 * Output: DecisionObservation[] — one per detected decision kind
 */
export function observeDecisions(input: ObserverInput): DecisionObservation[] {
  const observations: DecisionObservation[] = [];

  const overrides = extractOverrides(input.events);
  const escalations = extractEscalations(input.events);
  const rejections = extractRejections(input.events);
  const autonomyGrants = extractAutonomyGrants(input.events);

  if (overrides.length >= MIN_EVENTS_FOR_OBSERVATION) {
    observations.push(
      buildObservation(input.workspaceId, 'override', overrides, input.nowMs),
    );
  }
  if (escalations.length >= MIN_EVENTS_FOR_OBSERVATION) {
    observations.push(
      buildObservation(input.workspaceId, 'escalation', escalations, input.nowMs),
    );
  }
  if (rejections.length >= MIN_EVENTS_FOR_OBSERVATION) {
    observations.push(
      buildObservation(input.workspaceId, 'rejection', rejections, input.nowMs),
    );
  }
  if (autonomyGrants.length >= MIN_EVENTS_FOR_OBSERVATION) {
    observations.push(
      buildObservation(input.workspaceId, 'autonomy_grant', autonomyGrants, input.nowMs),
    );
  }

  return observations;
}
