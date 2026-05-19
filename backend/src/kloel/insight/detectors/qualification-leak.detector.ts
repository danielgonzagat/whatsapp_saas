/**
 * UTP-INSIGHT-004 — Qualification Leak Detector.
 *
 * Detects leads that were qualified but subsequently lost without
 * conversion. Flags when the qualified→lost ratio exceeds normal.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { withinWindow } from '../insight.types';

const MIN_QUALIFIED = 3;
const LEAK_THRESHOLD = 0.4;

export function detectQualificationLeak(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 90;
  const insights: Insight[] = [];

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  let qualifiedCount = 0;
  let lostAfterQualified = 0;
  const qualifiedLeadIds = new Set<string>();

  for (const event of filtered) {
    if (event.eventName === 'commerce.lead.qualified') {
      const leadId = event.entityRef?.entityId;
      if (leadId) {
        qualifiedLeadIds.add(leadId);
        qualifiedCount++;
      }
    }
  }

  for (const event of filtered) {
    if (event.eventName === 'commerce.lead.lost') {
      const leadId = event.entityRef?.entityId;
      if (leadId && qualifiedLeadIds.has(leadId)) {
        lostAfterQualified++;
      }
    }
  }

  if (qualifiedCount < MIN_QUALIFIED) return { insights: [] };

  const leakRate = lostAfterQualified / qualifiedCount;

  if (leakRate >= LEAK_THRESHOLD) {
    const estimatedLoss = Math.round(lostAfterQualified * 150_00);

    insights.push({
      insightId: `insight_ql_${workspaceId}`,
      kind: 'qualification_leak',
      description: `${lostAfterQualified} of ${qualifiedCount} qualified leads lost without conversion (${(leakRate * 100).toFixed(0)}% leak rate)`,
      evidence: [
        `qualified leads: ${qualifiedCount}`,
        `leads lost after qualification: ${lostAfterQualified}`,
        `leak rate: ${(leakRate * 100).toFixed(1)}%`,
      ],
      estimatedFinancialImpactCents: estimatedLoss,
      confidence: Math.min(0.9, 0.4 + leakRate * 0.5),
      recommendedChannel: 'whatsapp',
      recommendedTiming: 'now',
      workspaceId,
      truthMode: 'inferred',
      generatedAt: new Date(nowMs).toISOString(),
    });
  }

  return { insights };
}
