/**
 * UTP-INSIGHT-RANK-001 — Insight Ranker.
 *
 * Sorts insights by estimatedFinancialImpactCents * confidence
 * (impact-confidence product). Highest product = most actionable
 * insight. Returns ranked list with the product pre-computed.
 */

import type { Insight, RankedInsight } from './insight.types';

export function rankInsights(insights: readonly Insight[]): readonly RankedInsight[] {
  const ranked: RankedInsight[] = insights.map((insight) => ({
    ...insight,
    impactConfidenceProduct: insight.estimatedFinancialImpactCents * insight.confidence,
  }));

  return ranked.sort((a, b) => b.impactConfidenceProduct - a.impactConfidenceProduct);
}
