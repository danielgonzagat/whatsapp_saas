/**
 * UTP-INSIGHT-008 — Product Positioning Detector.
 *
 * Detects positioning-perception drift by comparing the declared
 * product role with the actual usage patterns revealed in event
 * data. Flags when the market perceives a product differently
 * than its intended positioning.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { withinWindow } from '../insight.types';

const MIN_TRANSACTIONS = 5;

function extractProductRole(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  if (!payload) return 'unknown';
  const role =
    payload['productRole'] ?? payload['role'] ?? payload['tier'] ?? payload['category'];
  return typeof role === 'string' ? role : 'unknown';
}

function extractProductId(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  if (!payload) return 'unknown';
  const pid = payload['productId'] ?? payload['productRef'];
  return typeof pid === 'string' ? pid : 'unknown';
}

const LOW_TIER = new Set(['basic', 'starter', 'entry', 'free', 'trial']);
const HIGH_TIER = new Set(['premium', 'pro', 'enterprise', 'vip', 'ultimate']);

export function detectProductPositioning(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 90;
  const insights: Insight[] = [];

  const approved = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      e.eventName === 'commerce.payment.approved' &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  if (approved.length < MIN_TRANSACTIONS) return { insights: [] };

  const productRoles = new Map<
    string,
    { declaredRole: string; purchaseCount: number; refundCount: number }
  >();

  for (const event of approved) {
    const pid = extractProductId(event.payload);
    const role = extractProductRole(event.payload);

    const entry = productRoles.get(pid) ?? {
      declaredRole: role,
      purchaseCount: 0,
      refundCount: 0,
    };
    entry.purchaseCount++;
    productRoles.set(pid, entry);
  }

  const refunds = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      (e.eventName === 'commerce.payment.refunded' ||
        e.eventName === 'commerce.payment.charged_back') &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  for (const event of refunds) {
    const pid = extractProductId(event.payload);
    const entry = productRoles.get(pid);
    if (entry) entry.refundCount++;
  }

  for (const [productId, { declaredRole, purchaseCount, refundCount }] of productRoles) {
    const refundRate = purchaseCount > 0 ? refundCount / purchaseCount : 0;

    const isLowTier = LOW_TIER.has(declaredRole.toLowerCase());
    const isHighTier = HIGH_TIER.has(declaredRole.toLowerCase());

    if (isLowTier && refundRate > 0.2 && purchaseCount >= MIN_TRANSACTIONS) {
      insights.push({
        insightId: `insight_pp_${workspaceId}_${productId}`,
        kind: 'product_positioning',
        description: `product "${productId}" declared as low-tier ("${declaredRole}") has ${(refundRate * 100).toFixed(0)}% refund rate — possible positioning-perception mismatch (buyers expect more)`,
        evidence: [
          `product: ${productId}`,
          `declared role: ${declaredRole}`,
          `purchase count: ${purchaseCount}`,
          `refund rate: ${(refundRate * 100).toFixed(1)}%`,
        ],
        estimatedFinancialImpactCents: Math.round(
          refundCount * 150_00,
        ),
        confidence: Math.min(0.8, 0.4 + refundRate * 1.5),
        recommendedChannel: 'dashboard',
        recommendedTiming: 'weekly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }

    if (isHighTier && refundRate < 0.03 && purchaseCount >= MIN_TRANSACTIONS) {
      insights.push({
        insightId: `insight_pp_${workspaceId}_${productId}`,
        kind: 'product_positioning',
        description: `product "${productId}" declared as high-tier ("${declaredRole}") has very low refund rate (${(refundRate * 100).toFixed(1)}%) — perception matches premium positioning`,
        evidence: [
          `product: ${productId}`,
          `declared role: ${declaredRole}`,
          `purchase count: ${purchaseCount}`,
          `refund rate: ${(refundRate * 100).toFixed(1)}%`,
        ],
        estimatedFinancialImpactCents: 0,
        confidence: 0.7,
        recommendedChannel: 'report',
        recommendedTiming: 'monthly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  return { insights };
}
