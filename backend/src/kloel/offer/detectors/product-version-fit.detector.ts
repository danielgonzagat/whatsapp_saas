/**
 * UTP-OFFER-003 — Product Version Fit Detector.
 *
 * Detects when the current product version/complexity doesn't fit the
 * market. Signals when a simpler version or a premium version is needed
 * based on refund rate, churn risk, and engagement signals.
 */

import type {
  OfferDetectorInput,
  OfferDetectorResult,
  OfferInsight,
} from '../offer.types';
import { OFFER_EVENT_NAMES, withinWindow } from '../offer.types';

const MIN_SALES_PER_PRODUCT = 4;
const HIGH_REFUND_RATE = 0.25;
const HIGH_CHURN_SIGNAL_RATE = 0.3;
const WINDOW_DAYS = 120;

function extractProductId(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  if (!payload) {return 'unknown';}
  const pid = payload['productId'] ?? payload['productRef'] ?? payload['planId'];
  return typeof pid === 'string' ? pid : 'unknown';
}

function extractProductTier(
  payload: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (!payload) {return undefined;}
  const tier = payload['productTier'] ?? payload['tier'];
  return typeof tier === 'string' ? tier : undefined;
}

export function detectProductVersionFit(
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
  const productChurn = new Map<string, number>();
  const productTiers = new Map<string, string>();

  for (const event of filtered) {
    const pid = extractProductId(event.payload);
    const tier = extractProductTier(event.payload);
    if (tier) {productTiers.set(pid, tier);}

    if (event.eventName === 'commerce.payment.approved') {
      productSales.set(pid, (productSales.get(pid) ?? 0) + 1);
    } else if (event.eventName === 'commerce.payment.refunded') {
      productRefunds.set(pid, (productRefunds.get(pid) ?? 0) + 1);
    } else if (event.eventName === 'commerce.post_sale.churn_risk_detected') {
      productChurn.set(pid, (productChurn.get(pid) ?? 0) + 1);
    }
  }

  for (const [productId, sales] of productSales) {
    if (sales < MIN_SALES_PER_PRODUCT) {continue;}
    const refunds = productRefunds.get(productId) ?? 0;
    const churn = productChurn.get(productId) ?? 0;
    const refundRate = refunds / sales;
    const churnRate = churn / sales;

    if (refundRate > HIGH_REFUND_RATE) {
      const tier = productTiers.get(productId);
      const direction = tier === 'premium' ? 'simplify' : 'add premium';
      insights.push({
        insightId: `offer_pvf_refund_${workspaceId}_${productId}`,
        kind: 'product_version_fit',
        description: `product ${productId} has ${(refundRate * 100).toFixed(1)}% refund rate (${refunds}/${sales}) — consider ${direction === 'simplify' ? 'a simpler version' : 'a premium upgrade option'} to reduce mismatch`,
        evidence: [
          `product ${productId}: ${sales} sales, ${refunds} refunds (${(refundRate * 100).toFixed(1)}%)`,
          `tier: ${tier ?? 'unknown'}, direction: ${direction}`,
        ],
        impactMultiplicative: Math.max(1.0, 1.0 + refundRate * 4),
        confidence: Math.min(0.85, 0.4 + refundRate * 1.5),
        recommendedChannel: 'dashboard',
        recommendedTiming: 'weekly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }

    if (churnRate > HIGH_CHURN_SIGNAL_RATE && !insights.some((i) => i.insightId.includes(productId))) {
      insights.push({
        insightId: `offer_pvf_churn_${workspaceId}_${productId}`,
        kind: 'product_version_fit',
        description: `product ${productId} shows ${(churnRate * 100).toFixed(1)}% churn risk signals (${churn}/${sales}) — version may not be delivering sustained value`,
        evidence: [
          `product ${productId}: ${sales} sales, ${churn} churn signals (${(churnRate * 100).toFixed(1)}%)`,
        ],
        impactMultiplicative: Math.max(1.0, 1.2 + churnRate * 3),
        confidence: Math.min(0.8, 0.35 + churnRate * 1.2),
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
