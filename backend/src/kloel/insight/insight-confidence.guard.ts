/**
 * UTP-INSIGHT-CONF-001 — Insight Confidence Guard.
 *
 * Enforces a minimum confidence floor. Insights below the threshold
 * are not delivered. The floor defaults to 0.5 and is configurable
 * per insight kind for stricter requirements on critical detectors.
 */

import type { Insight } from './insight.types';

const DEFAULT_CONFIDENCE_FLOOR = 0.5;

const PER_KIND_FLOOR: ReadonlyMap<string, number> = new Map([
  ['pricing_elasticity', 0.6],
  ['channel_roi', 0.55],
]);

export function confidenceFloor(
  insight: Insight,
  floor?: number,
): { readonly pass: boolean; readonly reason?: string } {
  const effectiveFloor = floor ?? PER_KIND_FLOOR.get(insight.kind) ?? DEFAULT_CONFIDENCE_FLOOR;

  if (insight.confidence < effectiveFloor) {
    return {
      pass: false,
      reason: `insight confidence ${insight.confidence.toFixed(2)} below floor ${effectiveFloor} for kind ${insight.kind}`,
    };
  }

  return { pass: true };
}

export function filterAboveFloor(
  insights: readonly Insight[],
  floor?: number,
): readonly Insight[] {
  return insights.filter((i) => confidenceFloor(i, floor).pass);
}
