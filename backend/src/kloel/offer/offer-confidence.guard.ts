/**
 * UTP-OFFER-008 — Offer Confidence Guard.
 *
 * Enforces a minimum confidence floor. Insights below the threshold
 * are not delivered. The floor defaults to 0.5 and is configurable
 * per insight kind for stricter requirements on critical detectors.
 */

import type { OfferInsight } from './offer.types';

const DEFAULT_CONFIDENCE_FLOOR = 0.5;

const PER_KIND_FLOOR: ReadonlyMap<string, number> = new Map([
  ['pricing_psychology', 0.55],
  ['promise_strength', 0.55],
  ['page_promise_mismatch', 0.6],
]);

export function offerConfidenceFloor(
  insight: OfferInsight,
  floor?: number,
): { readonly pass: boolean; readonly reason?: string } {
  const effectiveFloor =
    floor ?? PER_KIND_FLOOR.get(insight.kind) ?? DEFAULT_CONFIDENCE_FLOOR;

  if (insight.confidence < effectiveFloor) {
    return {
      pass: false,
      reason: `offer insight confidence ${insight.confidence.toFixed(2)} below floor ${effectiveFloor} for kind ${insight.kind}`,
    };
  }

  return { pass: true };
}

export function filterOfferAboveFloor(
  insights: readonly OfferInsight[],
  floor?: number,
): readonly OfferInsight[] {
  return insights.filter((i) => offerConfidenceFloor(i, floor).pass);
}
