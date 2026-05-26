/**
 * UTP-INSIGHT-005 — Cooling Window Detector.
 *
 * Measures time from lead creation → conversion decay. Surfaces
 * when the median time-to-conversion exceeds expected windows,
 * signalling cooling that needs intervention.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { median, timestampMs, withinWindow } from '../insight.types';

const MIN_CONVERSIONS = 3;
const COOLING_WARNING_DAYS = 14;

export function detectCoolingWindow(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 90;
  const insights: Insight[] = [];

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  const leadCreationTimes = new Map<string, number>();

  for (const event of filtered) {
    if (event.eventName === 'commerce.lead.created') {
      const leadId = event.entityRef?.entityId;
      if (leadId) {
        leadCreationTimes.set(leadId, timestampMs(event.occurredAt));
      }
    }
  }

  const conversionDurations: number[] = [];

  for (const event of filtered) {
    if (event.eventName === 'commerce.lead.converted') {
      let leadId = event.entityRef?.entityId;
      if (!leadId) {
        const payload = event.payload;
        if (payload) {
          const pid = payload['leadId'] ?? payload['leadRef'];
          if (typeof pid === 'string') {leadId = pid;}
        }
      }
      if (leadId) {
        const created = leadCreationTimes.get(leadId);
        if (created !== undefined) {
          const conversionMs = timestampMs(event.occurredAt);
          if (Number.isFinite(conversionMs) && conversionMs > created) {
            conversionDurations.push((conversionMs - created) / (1000 * 60 * 60 * 24));
          }
        }
      }
    }
  }

  if (conversionDurations.length < MIN_CONVERSIONS) {return { insights: [] };}

  const med = median(conversionDurations);

  if (med >= COOLING_WARNING_DAYS) {
    const estimatedLoss = Math.round(
      conversionDurations.length * 0.2 * 100_00,
    );

    insights.push({
      insightId: `insight_cw_${workspaceId}`,
      kind: 'cooling_window',
      description: `median time from lead to conversion: ${med.toFixed(1)} days (${conversionDurations.length} conversions). Leads may be cooling before closing.`,
      evidence: [
        `conversions analyzed: ${conversionDurations.length}`,
        `median conversion time: ${med.toFixed(1)} days`,
        `threshold: ${COOLING_WARNING_DAYS} days`,
      ],
      estimatedFinancialImpactCents: estimatedLoss,
      confidence: Math.min(0.85, 0.4 + (med / COOLING_WARNING_DAYS) * 0.3),
      recommendedChannel: 'dashboard',
      recommendedTiming: 'weekly',
      workspaceId,
      truthMode: 'inferred',
      generatedAt: new Date(nowMs).toISOString(),
    });
  }

  return { insights };
}
