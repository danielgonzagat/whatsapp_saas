import type { SpineEventRef } from '../mind/mind.types';
import type { BehaviorSnapshot, AttributedCause, AttributedDrift } from './drift.types';

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 3_600_000;

function eventInWindow(event: SpineEventRef, weekStart: string): boolean {
  const weekStartMs = new Date(`${weekStart}T00:00:00.000Z`).getTime();
  const eventMs = new Date(event.occurredAt).getTime();
  return eventMs >= weekStartMs && eventMs < weekStartMs + ATTRIBUTION_WINDOW_MS;
}

const ATTRIBUTABLE_EVENT_PATTERNS: ReadonlyArray<{
  eventName: string;
  label: string;
  score: number;
}> = [
  { eventName: 'commerce.campaign.performance_drop_detected', label: 'campaign performance drop', score: 3 },
  { eventName: 'commerce.campaign.creative_swapped', label: 'creative swap', score: 2 },
  { eventName: 'evolution.gap_detected', label: 'system gap detected', score: 3 },
  { eventName: 'commerce.lead.objection_raised', label: 'objection spike', score: 2 },
  { eventName: 'commerce.payment.charged_back', label: 'chargeback event', score: 2 },
  { eventName: 'commerce.whatsapp.handoff_to_human', label: 'escalation to human', score: 1 },
  { eventName: 'commerce.post_sale.churn_risk_detected', label: 'churn risk cluster', score: 2 },
  { eventName: 'commerce.crm.stage_changed', label: 'pipeline stage shift', score: 1 },
  { eventName: 'commerce.whatsapp.session_lifecycle', label: 'whatsapp session change', score: 2 },
  { eventName: 'commerce.payment.declined', label: 'payment declined cluster', score: 2 },
];

export function attributeDrift(
  driftSnapshot: BehaviorSnapshot,
  _priorSnapshot: BehaviorSnapshot | undefined,
  allEvents: readonly SpineEventRef[],
  opts: { readonly nowIso?: string } = {},
): AttributedDrift {
  const workspaceId = driftSnapshot.workspaceId;
  const weekEvents = allEvents.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      eventInWindow(e, driftSnapshot.weekStart),
  );

  const causes: AttributedCause[] = [];

  for (const pattern of ATTRIBUTABLE_EVENT_PATTERNS) {
    const matching = weekEvents.filter(
      (e) => e.eventName === pattern.eventName,
    );
    if (matching.length === 0) continue;

    const count = matching.length;
    const e = matching[matching.length - 1]!;
    const confidence = Math.min(0.95, 0.3 + count * 0.15 + pattern.score * 0.1);

    causes.push({
      eventRef: e.eventId,
      eventName: e.eventName,
      occurredAt: e.occurredAt,
      confidence,
      reasoning: `${count} ${pattern.label} event${count > 1 ? 's' : ''} detected in drift week`,
    });
  }

  causes.sort((a, b) => b.confidence - a.confidence);
  const primaryCause = causes.length > 0 ? causes[0] : undefined;

  return {
    driftId: `drift_${workspaceId}_${driftSnapshot.weekStart}`,
    workspaceId,
    attribution: causes,
    primaryCause,
    computedAt: opts.nowIso ?? new Date().toISOString(),
  };
}
