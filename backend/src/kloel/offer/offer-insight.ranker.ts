/**
 * UTP-OFFER-007 — Offer Insight Ranker.
 *
 * Ranks offer insights by impactMultiplicative * confidence
 * (ranked product). Highest product = most actionable insight.
 * Returns ranked list with the product pre-computed.
 */

import type { OfferInsight, RankedOfferInsight } from './offer.types';

export function rankOfferInsights(
  insights: readonly OfferInsight[],
): readonly RankedOfferInsight[] {
  const ranked: RankedOfferInsight[] = insights.map((insight) => ({
    ...insight,
    rankedProduct: insight.impactMultiplicative * insight.confidence,
  }));

  return ranked.sort(
    (a, b) => b.rankedProduct - a.rankedProduct,
  );
}
