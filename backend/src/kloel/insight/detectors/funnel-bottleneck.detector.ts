/**
 * UTP-INSIGHT-001 — Funnel Bottleneck Detector.
 *
 * Finds the drop-off stages in the conversion pipeline by comparing
 * event counts at each stage. The stage with the largest relative
 * drop-off is flagged as the bottleneck.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { INSIGHT_EVENT_NAMES, withinWindow } from '../insight.types';

const PROGRESSION_ORDER: readonly string[] = [
  'commerce.lead.created',
  'commerce.lead.contacted',
  'commerce.lead.replied',
  'commerce.lead.qualified',
  'commerce.lead.converted',
];

const STAGE_LABELS: ReadonlyMap<string, string> = new Map([
  ['commerce.lead.created', 'lead creation'],
  ['commerce.lead.contacted', 'first contact'],
  ['commerce.lead.replied', 'lead replied'],
  ['commerce.lead.qualified', 'qualified'],
  ['commerce.lead.converted', 'converted to paying'],
]);

const ESTIMATED_VALUE_PER_CONVERSION_CENTS = 100_00;

export function detectFunnelBottleneck(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 60;

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      INSIGHT_EVENT_NAMES.has(e.eventName) &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  const counts = new Map<string, number>();
  for (const event of filtered) {
    if (PROGRESSION_ORDER.includes(event.eventName)) {
      counts.set(event.eventName, (counts.get(event.eventName) ?? 0) + 1);
    }
  }

  if ((counts.get('commerce.lead.created') ?? 0) < 5) {
    return { insights: [] };
  }

  const insights: Insight[] = [];

  for (let i = 1; i < PROGRESSION_ORDER.length; i++) {
    const prevStage = PROGRESSION_ORDER[i - 1];
    const currStage = PROGRESSION_ORDER[i];

    if (prevStage === undefined || currStage === undefined) continue;

    const prevCount = counts.get(prevStage) ?? 0;
    const currCount = counts.get(currStage) ?? 0;

    if (prevCount === 0) continue;

    const dropRate = 1 - currCount / prevCount;

    if (dropRate >= 0.6 && currCount >= 1) {
      const prevLabel = STAGE_LABELS.get(prevStage) ?? prevStage;
      const currLabel = STAGE_LABELS.get(currStage) ?? currStage;
      const lostLeads = prevCount - currCount;
      const estimatedLoss = lostLeads * ESTIMATED_VALUE_PER_CONVERSION_CENTS;

      insights.push({
        insightId: `insight_fb_${workspaceId}_${currStage.replace(/\./g, '_')}`,
        kind: 'funnel_bottleneck',
        description: `${Math.round(dropRate * 100)}% drop-off from ${prevLabel} to ${currLabel}: ${lostLeads} of ${prevCount} leads lost  (${currCount} reached ${currLabel})`,
        evidence: [
          `${prevLabel} count: ${prevCount}`,
          `${currLabel} count: ${currCount}`,
          `drop rate: ${(dropRate * 100).toFixed(1)}%`,
        ],
        estimatedFinancialImpactCents: Math.min(estimatedLoss, 999_999_00),
        confidence: Math.min(0.95, 0.5 + dropRate * 0.4),
        recommendedChannel: 'dashboard',
        recommendedTiming: 'weekly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  return { insights };
}
