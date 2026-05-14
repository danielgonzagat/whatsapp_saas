import type { SpineEventRef } from '../mind/mind.types';
import type { BehaviorSnapshot, MetricBundle, WeekBucket } from './drift.types';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d.getTime() - diffToMonday * 86_400_000);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function weekEndFromStart(weekStart: string): string {
  const monday = new Date(`${weekStart}T00:00:00.000Z`);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday.toISOString();
}

function bucketEventsByWeek(events: readonly SpineEventRef[]): WeekBucket[] {
  const weeks = new Map<string, SpineEventRef[]>();
  for (const e of events) {
    const k = weekKey(e.occurredAt);
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k)!.push(e);
  }
  return Array.from(weeks.entries())
    .map(([weekStart, weekEvents]) => ({
      weekStart,
      weekEnd: weekEndFromStart(weekStart),
      events: weekEvents,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function computeConversionRate(events: readonly SpineEventRef[]): {
  rate: number;
  leadCount: number;
  conversionCount: number;
} {
  let leadCreated = 0;
  let leadConverted = 0;
  for (const e of events) {
    if (e.eventName === 'commerce.lead.created') leadCreated++;
    else if (e.eventName === 'commerce.lead.converted') leadConverted++;
  }
  return {
    rate: leadCreated > 0 ? leadConverted / leadCreated : 0,
    leadCount: leadCreated,
    conversionCount: leadConverted,
  };
}

function computeAvgResponseMinutes(events: readonly SpineEventRef[]): number {
  const leadTimes = new Map<string, string>();
  const latencies: number[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.lead.created') {
      const ref = e.entityRef?.entityId;
      if (ref) leadTimes.set(ref, e.occurredAt);
    } else if (
      e.eventName === 'commerce.lead.contacted' ||
      e.eventName === 'commerce.whatsapp.message_replied'
    ) {
      const ref = e.entityRef?.entityId;
      if (ref && leadTimes.has(ref)) {
        const created = new Date(leadTimes.get(ref)!).getTime();
        const contacted = new Date(e.occurredAt).getTime();
        latencies.push((contacted - created) / MS_PER_MINUTE);
      }
    }
  }
  if (latencies.length === 0) return 0;
  return latencies.reduce((s, v) => s + v, 0) / latencies.length;
}

function computeAvgConversionHours(events: readonly SpineEventRef[]): number {
  const leadTimes = new Map<string, string>();
  const conversionTimes: number[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.lead.created') {
      const ref = e.entityRef?.entityId;
      if (ref) leadTimes.set(ref, e.occurredAt);
    } else if (e.eventName === 'commerce.lead.converted') {
      const ref = e.entityRef?.entityId;
      if (ref && leadTimes.has(ref)) {
        const created = new Date(leadTimes.get(ref)!).getTime();
        const converted = new Date(e.occurredAt).getTime();
        conversionTimes.push((converted - created) / MS_PER_HOUR);
      }
    }
  }
  if (conversionTimes.length === 0) return 0;
  return conversionTimes.reduce((s, v) => s + v, 0) / conversionTimes.length;
}

function computeObjectionMix(
  events: readonly SpineEventRef[],
): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const e of events) {
    if (e.eventName !== 'commerce.lead.objection_raised') continue;
    const payload = e.payload as Record<string, unknown> | undefined;
    const kind =
      (payload?.['objectionKind'] as string) ??
      (payload?.['kind'] as string) ??
      'unclassified';
    mix[kind] = (mix[kind] ?? 0) + 1;
  }
  return mix;
}

function computePaymentSuccessRate(events: readonly SpineEventRef[]): number {
  let approved = 0;
  let declined = 0;
  for (const e of events) {
    if (e.eventName === 'commerce.payment.approved') approved++;
    else if (e.eventName === 'commerce.payment.declined') declined++;
  }
  const total = approved + declined;
  return total > 0 ? approved / total : 1;
}

function computeChurnRate(events: readonly SpineEventRef[]): number {
  let churnDetected = 0;
  let totalCustomers = 0;
  const uniqueCustomers = new Set<string>();

  for (const e of events) {
    if (e.eventName === 'commerce.lead.converted' && e.entityRef?.entityId) {
      uniqueCustomers.add(e.entityRef.entityId);
    } else if (
      e.eventName === 'commerce.post_sale.churn_risk_detected' &&
      e.entityRef?.entityId
    ) {
      churnDetected++;
    }
  }
  totalCustomers = uniqueCustomers.size;
  return totalCustomers > 0 ? churnDetected / totalCustomers : 0;
}

function computeMetrics(events: readonly SpineEventRef[]): {
  metrics: MetricBundle;
  leadCount: number;
  conversionCount: number;
} {
  const { rate: conversionRate, leadCount, conversionCount } =
    computeConversionRate(events);
  const avgResponseMinutes = computeAvgResponseMinutes(events);
  const avgConversionHours = computeAvgConversionHours(events);
  const objectionMix = computeObjectionMix(events);
  const paymentSuccessRate = computePaymentSuccessRate(events);
  const churnRate = computeChurnRate(events);

  return {
    metrics: {
      conversionRate,
      avgResponseMinutes,
      avgConversionHours,
      objectionMix,
      paymentSuccessRate,
      churnRate,
    },
    leadCount,
    conversionCount,
  };
}

export function collectWeeklySnapshots(
  workspaceId: string,
  events: readonly SpineEventRef[],
  opts: { readonly nowIso?: string } = {},
): BehaviorSnapshot[] {
  const workspaceEvents = events.filter(
    (e) => e.workspaceId === workspaceId,
  );
  const weeks = bucketEventsByWeek(workspaceEvents);

  return weeks.map((bucket, idx) => {
    const { metrics, leadCount, conversionCount } = computeMetrics(
      bucket.events,
    );
    return {
      snapshotId: `snap_${workspaceId}_w${String(idx + 1).padStart(3, '0')}`,
      workspaceId,
      weekStart: bucket.weekStart,
      weekEnd: bucket.weekEnd,
      metrics,
      eventCount: bucket.events.length,
      leadCount,
      conversionCount,
      computedAt: opts.nowIso ?? new Date().toISOString(),
    };
  });
}
