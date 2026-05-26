/**
 * UTP-OFFER-005 — Page Promise Mismatch Detector.
 *
 * Detects when what the sales page promises differs from what the offer
 * actually delivers, causing refunds, chargebacks, or poor satisfaction.
 * Compares refund rate and satisfaction signals against conversion rate.
 */

import type {
  OfferDetectorInput,
  OfferDetectorResult,
  OfferInsight,
} from '../offer.types';
import { OFFER_EVENT_NAMES, withinWindow } from '../offer.types';

const MIN_TRANSACTIONS = 5;
const MISMATCH_REFUND_RATE = 0.2;
const WINDOW_DAYS = 120;

function extractProductId(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  if (!payload) {return 'unknown';}
  const pid = payload['productId'] ?? payload['productRef'] ?? payload['planId'];
  return typeof pid === 'string' ? pid : 'unknown';
}

export function detectPagePromiseMismatch(
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

  const productSales = new Map<string, number>();
  const productRefunds = new Map<string, number>();
  const productChargebacks = new Map<string, number>();
  const productSatisfaction = new Map<string, number[]>();

  for (const event of filtered) {
    const pid = extractProductId(event.payload);

    if (event.eventName === 'commerce.payment.approved') {
      productSales.set(pid, (productSales.get(pid) ?? 0) + 1);
    } else if (event.eventName === 'commerce.payment.refunded') {
      productRefunds.set(pid, (productRefunds.get(pid) ?? 0) + 1);
    } else if (event.eventName === 'commerce.payment.charged_back') {
      productChargebacks.set(pid, (productChargebacks.get(pid) ?? 0) + 1);
    } else if (event.eventName === 'commerce.post_sale.satisfaction_signal_observed') {
      const score = event.payload?.['score'];
      if (typeof score === 'number') {
        const list = productSatisfaction.get(pid) ?? [];
        list.push(score);
        productSatisfaction.set(pid, list);
      }
    }
  }

  for (const [productId, sales] of productSales) {
    if (sales < MIN_TRANSACTIONS) {continue;}
    const refunds = productRefunds.get(productId) ?? 0;
    const chargebacks = productChargebacks.get(productId) ?? 0;
    const badOutcomes = refunds + chargebacks;
    const badRate = badOutcomes / sales;

    if (badRate >= MISMATCH_REFUND_RATE) {
      const satScores = productSatisfaction.get(productId) ?? [];
      const satAvg =
        satScores.length > 0
          ? satScores.reduce((a, b) => a + b, 0) / satScores.length
          : undefined;
      const satDetail =
        satAvg !== undefined
          ? ` | avg satisfaction: ${satAvg.toFixed(1)}`
          : '';

      insights.push({
        insightId: `offer_ppm_${workspaceId}_${productId}`,
        kind: 'page_promise_mismatch',
        description: `product ${productId} has ${(badRate * 100).toFixed(1)}% bad outcomes (${badOutcomes}/${sales} sales)${satDetail} — sales page may be overpromising relative to delivery`,
        evidence: [
          `product ${productId}: ${sales} sales, ${refunds} refunds, ${chargebacks} chargebacks`,
          `bad outcome rate: ${(badRate * 100).toFixed(1)}%`,
          ...(satAvg !== undefined
            ? [`avg satisfaction: ${satAvg.toFixed(1)}`]
            : []),
        ],
        impactMultiplicative: Math.max(1.0, 1.0 + badRate * 5),
        confidence: Math.min(0.9, 0.4 + badRate * 2),
        recommendedChannel: 'whatsapp',
        recommendedTiming: 'now',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  return { insights };
}
