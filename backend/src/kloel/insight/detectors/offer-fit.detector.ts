/**
 * UTP-INSIGHT-002 — Offer Fit Detector.
 *
 * Detects product↔conversion correlations. When certain products
 * show significantly lower conversion rates than average, the
 * offer-fit gap is reported.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { INSIGHT_EVENT_NAMES, withinWindow } from '../insight.types';

const MIN_INSTANCES = 3;
const SIGNIFICANT_DROP = 0.3;

function extractProductId(payload: Readonly<Record<string, unknown>> | undefined): string {
  if (!payload) {return 'unknown';}
  const pid = payload['productId'] ?? payload['productRef'] ?? payload['planId'];
  return typeof pid === 'string' ? pid : 'unknown';
}

export function detectOfferFit(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 90;
  const insights: Insight[] = [];

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      INSIGHT_EVENT_NAMES.has(e.eventName) &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  const cartProduct = new Map<string, string[]>();
  const approvedProducts: string[] = [];

  for (const event of filtered) {
    if (event.eventName === 'commerce.cart.checkout_initiated') {
      const pid = extractProductId(event.payload);
      const list = cartProduct.get(event.entityRef?.entityId ?? '');
      if (list) {
        list.push(pid);
      } else {
        cartProduct.set(event.entityRef?.entityId ?? '', [pid]);
      }
    } else if (event.eventName === 'commerce.payment.approved') {
      const pid = extractProductId(event.payload);
      approvedProducts.push(pid);
    }
  }

  if (approvedProducts.length === 0) {return { insights: [] };}

  const totalApprovals = approvedProducts.length;
  const productCounts = new Map<string, number>();
  for (const pid of approvedProducts) {
    productCounts.set(pid, (productCounts.get(pid) ?? 0) + 1);
  }

  const avgShare = 1 / Math.max(1, productCounts.size);

  for (const [productId, count] of productCounts) {
    const share = count / totalApprovals;
    if (count >= MIN_INSTANCES && share < avgShare * (1 - SIGNIFICANT_DROP)) {
      insights.push({
        insightId: `insight_of_${workspaceId}_${productId}`,
        kind: 'offer_fit',
        description: `product ${productId} converts at ${(share * 100).toFixed(1)}% vs avg ${(avgShare * 100).toFixed(1)}% (${count}/${totalApprovals} sales)`,
        evidence: [
          `product ${productId}: ${count} sales out of ${totalApprovals}`,
          `avg share per product: ${(avgShare * 100).toFixed(1)}%`,
          `product share: ${(share * 100).toFixed(1)}%`,
        ],
        estimatedFinancialImpactCents: Math.round(
          (avgShare - share) * totalApprovals * 100_00,
        ),
        confidence: Math.min(0.85, 0.4 + (1 - share / avgShare) * 0.4),
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
