/**
 * UTP-INSIGHT-003 — Objection Pattern Detector.
 *
 * Clusters objection kinds from spine events and surfaces the
 * most frequent objection patterns with estimated impact.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { withinWindow } from '../insight.types';

const MIN_OBJECTIONS = 3;

function extractObjectionKind(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  if (!payload) {return 'unspecified';}
  const kind = payload['objectionKind'] ?? payload['kind'];
  return typeof kind === 'string' ? kind : 'unspecified';
}

export function detectObjectionPattern(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 90;
  const insights: Insight[] = [];

  const objectionEvents = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      e.eventName === 'commerce.lead.objection_raised' &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  if (objectionEvents.length < MIN_OBJECTIONS) {return { insights: [] };}

  const kindCounts = new Map<string, number>();
  for (const event of objectionEvents) {
    const kind = extractObjectionKind(event.payload);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  const total = objectionEvents.length;

  for (const [kind, count] of kindCounts) {
    const share = count / total;
    if (count >= MIN_OBJECTIONS && share >= 0.2) {
      const estimatedLoss = Math.round(count * 0.5 * 200_00);

      insights.push({
        insightId: `insight_op_${workspaceId}_${kind}`,
        kind: 'objection_pattern',
        description: `${count} objections of kind "${kind}" (${(share * 100).toFixed(0)}% of ${total} total objections) — potential conversion blocker`,
        evidence: [
          `objection kind: ${kind}`,
          `count: ${count}/${total}`,
          `share: ${(share * 100).toFixed(1)}%`,
        ],
        estimatedFinancialImpactCents: estimatedLoss,
        confidence: Math.min(0.9, 0.4 + share * 0.5),
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
