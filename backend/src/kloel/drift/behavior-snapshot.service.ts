import type { SpineEventRef } from '../mind/mind.types';
import type {
  DecisionPattern,
  ToneClass,
  WeeklyBehaviorSnapshot,
} from './drift.types';

const DECISION_EVENT_PREFIXES: readonly string[] = [
  'commerce.lead.converted',
  'commerce.crm.deal_won',
  'commerce.crm.deal_lost',
  'commerce.whatsapp.handoff_to_human',
  'commerce.payment.approved',
  'commerce.payment.declined',
  'commerce.post_sale.churn_risk_detected',
  'commerce.post_sale.first_value_obtained',
  'commerce.campaign.conversion_associated',
];

const MESSAGE_EVENT_NAMES: ReadonlySet<string> = new Set([
  'commerce.whatsapp.message_replied',
  'commerce.whatsapp.message_received',
]);

function isDecisionEvent(eventName: string): boolean {
  return DECISION_EVENT_PREFIXES.some((prefix) => eventName.startsWith(prefix));
}

function classifyTone(event: SpineEventRef): ToneClass {
  if (event.valence === 'positive') {return 'assertivo';}
  if (event.valence === 'negative') {
    if (
      event.eventName === 'commerce.post_sale.churn_risk_detected' ||
      event.eventName === 'commerce.payment.declined'
    ) {
      return 'urgente';
    }
    return 'urgente';
  }
  if (event.valence === 'ambiguous') {return 'consultivo';}
  if (event.truthMode === 'inferred') {return 'analitico';}
  if (
    event.eventName === 'commerce.post_sale.first_value_obtained' ||
    event.eventName === 'commerce.post_sale.satisfaction_signal_observed'
  ) {
    return 'empatico';
  }
  return 'neutro';
}

function countDecisions(
  events: readonly SpineEventRef[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (isDecisionEvent(e.eventName)) {
      counts.set(e.eventName, (counts.get(e.eventName) ?? 0) + 1);
    }
  }
  return counts;
}

function rankDecisions(counts: Map<string, number>): readonly string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

function computeToneDistribution(
  events: readonly SpineEventRef[],
): Record<ToneClass, number> {
  const distribution: Record<ToneClass, number> = {
    assertivo: 0,
    consultivo: 0,
    empatico: 0,
    analitico: 0,
    urgente: 0,
    neutro: 0,
  };
  for (const e of events) {
    const tone = classifyTone(e);
    distribution[tone]++;
  }
  return distribution;
}

function computeNarrativeStyleHash(
  events: readonly SpineEventRef[],
): string {
  const seeds: number[] = [];
  for (const e of events) {
    const charCode = e.eventName.charCodeAt(0) + (e.valence?.charCodeAt(0) ?? 0);
    seeds.push(charCode);
  }
  if (seeds.length === 0) {return 'empty';}
  let hash = 0x811c9dc5;
  for (const s of seeds) {
    hash ^= s;
    hash = Math.imul(hash, 0x01000193);
    hash = hash | 0;
  }
  return hash.toString(16);
}

function extractDecisionPatterns(
  events: readonly SpineEventRef[],
): readonly DecisionPattern[] {
  const decisionEvents = events.filter((e) => isDecisionEvent(e.eventName));
  if (decisionEvents.length < 2) {return [];}

  const patternCounts = new Map<string, number>();
  for (let i = 0; i < decisionEvents.length - 1; i++) {
    const pair = [
      decisionEvents[i]!.eventName,
      decisionEvents[i + 1]!.eventName,
    ].join(' → ');
    patternCounts.set(pair, (patternCounts.get(pair) ?? 0) + 1);
  }

  const total = [...patternCounts.values()].reduce((s, v) => s + v, 0);
  return [...patternCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pattern, count]) => ({
      pattern,
      count,
      weight: total > 0 ? count / total : 0,
    }));
}

function computeWeekEnd(weekStart: string): string {
  const monday = new Date(`${weekStart}T00:00:00.000Z`);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday.toISOString();
}

function filterWeekEvents(
  events: readonly SpineEventRef[],
  weekStart: string,
): readonly SpineEventRef[] {
  const weekEnd = computeWeekEnd(weekStart);
  const startMs = new Date(weekStart).getTime();
  const endMs = new Date(weekEnd).getTime();
  return events.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return t >= startMs && t <= endMs;
  });
}

export class BehaviorSnapshotService {
  snapshot(
    workspaceId: string,
    weekStartIso: string,
    events: readonly SpineEventRef[],
  ): WeeklyBehaviorSnapshot {
    const workspaceEvents = events.filter(
      (e) => e.workspaceId === workspaceId,
    );
    const weekEvents = filterWeekEvents(workspaceEvents, weekStartIso);

    const messagesSent = weekEvents.filter((e) =>
      MESSAGE_EVENT_NAMES.has(e.eventName),
    ).length;

    const decisionCounts = countDecisions(weekEvents);
    const decisionsRanked = rankDecisions(decisionCounts);

    const conversionsAttributed = decisionCounts.get(
      'commerce.lead.converted',
    ) ?? 0;

    const toneClassification = computeToneDistribution(weekEvents);
    const narrativeStyleHash = computeNarrativeStyleHash(weekEvents);
    const decisionPatterns = extractDecisionPatterns(weekEvents);

    return {
      snapshotId: `snap_${workspaceId}_${weekStartIso}`,
      workspaceId,
      weekStart: weekStartIso,
      weekEnd: computeWeekEnd(weekStartIso),
      messagesSent,
      decisionsRanked,
      conversionsAttributed,
      narrativeStyleHash,
      toneClassification,
      decisionPatterns,
      computedAt: new Date().toISOString(),
    };
  }
}
