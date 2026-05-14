/**
 * UTP-OFFER-006 — Pricing Psychology Signal Detector.
 *
 * Detects psychological pricing issues: anchoring effects, missing decoy
 * options, charm pricing opportunities, and price threshold effects.
 * Compares conversion rates across price points to identify suboptimal
 * pricing structures.
 */

import type {
  OfferDetectorInput,
  OfferDetectorResult,
  OfferInsight,
} from '../offer.types';
import { OFFER_EVENT_NAMES, median, withinWindow } from '../offer.types';

const MIN_TRANSACTIONS_PER_POINT = 4;
const WINDOW_DAYS = 120;

function extractAmountCents(
  payload: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  if (!payload) return undefined;
  const amt = payload['amountCents'] ?? payload['amount'] ?? payload['priceCents'];
  return typeof amt === 'number' ? amt : undefined;
}

export function detectPricingPsychologySignal(
  input: OfferDetectorInput,
): OfferDetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const insights: OfferInsight[] = [];

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      OFFER_EVENT_NAMES.has(e.eventName) &&
      withinWindow(e.occurredAt, nowMs, WINDOW_DAYS),
  );

  const pointApprovals = new Map<number, number>();
  const pointDeclines = new Map<number, number>();

  for (const event of filtered) {
    const amount = extractAmountCents(event.payload);
    if (amount === undefined || amount <= 0) continue;

    if (event.eventName === 'commerce.payment.approved') {
      pointApprovals.set(amount, (pointApprovals.get(amount) ?? 0) + 1);
    } else if (event.eventName === 'commerce.payment.declined') {
      pointDeclines.set(amount, (pointDeclines.get(amount) ?? 0) + 1);
    }
  }

  const allPoints = new Set([
    ...pointApprovals.keys(),
    ...pointDeclines.keys(),
  ]);

  if (allPoints.size < 2) return { insights: [] };

  const points: Array<{
    priceCents: number;
    approvals: number;
    declines: number;
    total: number;
    declineRate: number;
  }> = [];

  for (const priceCents of allPoints) {
    const approvals = pointApprovals.get(priceCents) ?? 0;
    const declines = pointDeclines.get(priceCents) ?? 0;
    const total = approvals + declines;
    if (total < MIN_TRANSACTIONS_PER_POINT) continue;
    points.push({
      priceCents,
      approvals,
      declines,
      total,
      declineRate: declines / total,
    });
  }

  if (points.length < 2) return { insights: [] };

  points.sort((a, b) => a.priceCents - b.priceCents);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (prev === undefined || curr === undefined) continue;

    const rateGap = curr.declineRate - prev.declineRate;
    if (rateGap > 0.3) {
      const optimalPrice = prev.priceCents;
      const gapDisplay = (curr.priceCents / 100).toFixed(2);
      const optimalDisplay = (optimalPrice / 100).toFixed(2);

      insights.push({
        insightId: `offer_pps_${workspaceId}_${curr.priceCents}`,
        kind: 'pricing_psychology',
        description: `sharp decline rate increase (+${(rateGap * 100).toFixed(0)}pp) at $${gapDisplay} vs $${optimalDisplay} — price may be hitting a psychological ceiling; consider anchoring or decoy pricing strategies`,
        evidence: [
          `price $${optimalDisplay}: ${prev.declineRate.toFixed(2)} decline rate (${prev.total} txns)`,
          `price $${gapDisplay}: ${curr.declineRate.toFixed(2)} decline rate (${curr.total} txns)`,
          `rate gap: +${(rateGap * 100).toFixed(0)}pp at $${gapDisplay} threshold`,
        ],
        impactMultiplicative: Math.max(1.0, 1.5 + rateGap * 4),
        confidence: Math.min(0.9, 0.45 + rateGap * 1.5),
        recommendedChannel: 'dashboard',
        recommendedTiming: 'weekly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  const declineRates = points.map((p) => p.declineRate);
  const medianDecline = median(declineRates);
  const highPriceOptimal = points.find(
    (p) => p.declineRate <= medianDecline && p.priceCents > median(points.map((pp) => pp.priceCents)),
  );

  if (highPriceOptimal) {
    insights.push({
      insightId: `offer_pps_upgrade_${workspaceId}`,
      kind: 'pricing_psychology',
      description: `higher price point $${(highPriceOptimal.priceCents / 100).toFixed(2)} performs at ${(highPriceOptimal.declineRate * 100).toFixed(1)}% decline — consider making it the anchor with a decoy below`,
      evidence: [
        `high performer: $${(highPriceOptimal.priceCents / 100).toFixed(2)} at ${(highPriceOptimal.declineRate * 100).toFixed(1)}% decline`,
        `median decline rate: ${(medianDecline * 100).toFixed(1)}%`,
      ],
      impactMultiplicative: Math.max(1.0, 1.3),
      confidence: Math.min(0.75, 0.4 + highPriceOptimal.total / 20),
      recommendedChannel: 'dashboard',
      recommendedTiming: 'monthly',
      workspaceId,
      truthMode: 'inferred',
      generatedAt: new Date(nowMs).toISOString(),
    });
  }

  return { insights };
}
