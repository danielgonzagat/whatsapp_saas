/**
 * UTP-TEAM-004 — Blind-Spot Illuminator
 *
 * Identifies hot leads operator hasn't touched in a configurable window.
 * A "hot" lead is one with recent activity (replies, objections, payments)
 * but no operator-side interaction (reply, next_step, handoff).
 *
 * Default window: 24 hours.
 */

import type { BlindSpotEntry, BlindSpotInput } from './team.types';
import type { SpineEventRef } from '../mind/mind.types';

const DEFAULT_WINDOW_HOURS = 24;
const HOT_LEAD_EVENTS: ReadonlySet<string> = new Set([
  'commerce.lead.replied',
  'commerce.lead.objection_raised',
  'commerce.payment.approved',
  'commerce.payment.declined',
  'commerce.cart.abandoned',
  'commerce.lead.created',
]);

const OPERATOR_ACTION_EVENTS: ReadonlySet<string> = new Set([
  'commerce.whatsapp.message_replied',
  'commerce.whatsapp.handoff_to_human',
  'commerce.crm.next_step_defined',
  'commerce.crm.owner_assigned',
]);

function parseTimestampMs(iso: string): number {
  return new Date(iso).getTime();
}

function hoursBetween(earlier: string, later: string): number {
  const ms = new Date(later).getTime() - new Date(earlier).getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

interface LeadActivity {
  readonly leadId: string;
  readonly eventCount: number;
  readonly latestEventAt: string;
}

function collectLeadActivity(
  events: readonly SpineEventRef[],
  workspaceId: string,
  nowIso: string,
  windowHours: number,
): readonly LeadActivity[] {
  const leadMap = new Map<string, LeadActivity>();

  for (const event of events) {
    if (event.workspaceId !== workspaceId) {continue;}

    const leadId = event.entityRef?.entityId;
    if (!leadId || event.entityRef?.entityType !== 'lead') {continue;}

    if (!HOT_LEAD_EVENTS.has(event.eventName)) {continue;}

    const hours = hoursBetween(event.occurredAt, nowIso);
    if (hours > windowHours) {continue;}

    const existing = leadMap.get(leadId);
    if (existing !== undefined) {
      const updated: LeadActivity = {
        leadId,
        eventCount: existing.eventCount + 1,
        latestEventAt:
          parseTimestampMs(event.occurredAt) >
          parseTimestampMs(existing.latestEventAt)
            ? event.occurredAt
            : existing.latestEventAt,
      };
      leadMap.set(leadId, updated);
    } else {
      leadMap.set(leadId, {
        leadId,
        eventCount: 1,
        latestEventAt: event.occurredAt,
      });
    }
  }

  return Array.from(leadMap.values());
}

function hasOperatorAction(
  events: readonly SpineEventRef[],
  leadId: string,
  windowHours: number,
  nowIso: string,
): boolean {
  return events.some((e) => {
    if (!OPERATOR_ACTION_EVENTS.has(e.eventName)) {return false;}
    if (e.entityRef?.entityId !== leadId) {return false;}
    if (e.entityRef.entityType !== 'lead') {return false;}
    return hoursBetween(e.occurredAt, nowIso) <= windowHours;
  });
}

function findLastTouch(
  events: readonly SpineEventRef[],
  leadId: string,
  nowIso: string,
  windowHours: number,
): string | undefined {
  let latest: string | undefined;
  let latestMs = 0;

  for (const event of events) {
    if (event.entityRef?.entityId !== leadId) {continue;}
    if (event.entityRef.entityType !== 'lead') {continue;}
    if (!OPERATOR_ACTION_EVENTS.has(event.eventName)) {continue;}

    const ms = parseTimestampMs(event.occurredAt);
    if (hoursBetween(event.occurredAt, nowIso) > windowHours * 2) {continue;}

    if (ms > latestMs) {
      latestMs = ms;
      latest = event.occurredAt;
    }
  }

  return latest;
}

export function illuminateBlindSpots(
  input: BlindSpotInput,
): readonly BlindSpotEntry[] {
  const windowHours = input.windowHours ?? DEFAULT_WINDOW_HOURS;
  const nowIso = input.nowIso ?? new Date().toISOString();

  const activeLeads = collectLeadActivity(
    input.events,
    input.workspaceId,
    nowIso,
    windowHours,
  );

  const results: BlindSpotEntry[] = [];

  for (const lead of activeLeads) {
    if (hasOperatorAction(input.events, lead.leadId, windowHours, nowIso)) {
      continue;
    }

    const lastTouch = findLastTouch(
      input.events,
      lead.leadId,
      nowIso,
      windowHours,
    );

    const reason = lastTouch
      ? `lead active (${lead.eventCount} events) but no operator touch in ${windowHours}h window`
      : `lead active (${lead.eventCount} events) — never touched by operator`;

    results.push({
      leadId: lead.leadId,
      workspaceId: input.workspaceId,
      reason,
      ...(lastTouch !== undefined ? { lastTouchAt: lastTouch } : {}),
      activityCount: lead.eventCount,
    });
  }

  return results.sort((a, b) => b.activityCount - a.activityCount);
}
