/**
 * UTP-WOW-003 — WOW Insight Ranker.
 *
 * Ranks discovered insights by impact for first-hour delivery.
 * Extends the canonical insight ranker with WOW-specific urgency
 * classification: insights are tagged as 'immediate', 'first_session',
 * or 'first_week' based on their estimated financial impact and
 * the maturity stage of the workspace.
 *
 * Pure function — no DI required.
 */

import type { Insight } from '../insight/insight.types';
import type { MaturityStage } from '../maturity/maturity.types';
import { type RankedWOWInsight } from './wow.types';

type WowUrgency = 'immediate' | 'first_session' | 'first_week';

function computeUrgency(impactConfidenceProduct: number, maturityStage: MaturityStage): WowUrgency {
  if (maturityStage === 'validacao' || maturityStage === 'tracao') {
    if (impactConfidenceProduct > 5000) {
      return 'immediate';
    }
    if (impactConfidenceProduct > 1500) {
      return 'first_session';
    }
    return 'first_week';
  }

  if (maturityStage === 'crescimento') {
    if (impactConfidenceProduct > 8000) {
      return 'immediate';
    }
    if (impactConfidenceProduct > 2500) {
      return 'first_session';
    }
    return 'first_week';
  }

  if (impactConfidenceProduct > 10000) {
    return 'immediate';
  }
  if (impactConfidenceProduct > 4000) {
    return 'first_session';
  }
  return 'first_week';
}

function urgencyPriority(urgency: WowUrgency): number {
  switch (urgency) {
    case 'immediate':
      return 3;
    case 'first_session':
      return 2;
    case 'first_week':
      return 1;
  }
}

export function rankWOWInsights(
  insights: readonly Insight[],
  maturityStage: MaturityStage,
): readonly RankedWOWInsight[] {
  const rankedBase: RankedWOWInsight[] = insights.map((insight) => {
    const impactConfidenceProduct = insight.estimatedFinancialImpactCents * insight.confidence;
    const urgency = computeUrgency(impactConfidenceProduct, maturityStage);
    return {
      ...insight,
      impactConfidenceProduct,
      wowUrgency: urgency,
      wowDeliveryPriority: urgencyPriority(urgency) * 1000 + impactConfidenceProduct,
    };
  });

  return rankedBase.sort((a, b) => b.wowDeliveryPriority - a.wowDeliveryPriority);
}
