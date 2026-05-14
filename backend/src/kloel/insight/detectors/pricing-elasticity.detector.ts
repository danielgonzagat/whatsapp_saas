/**
 * UTP-INSIGHT-006 — Pricing Elasticity Detector.
 *
 * Analyzes price-vs-conversion correlation. When multiple payment
 * events at different price points are available, detects whether
 * higher prices correlate with lower conversion volume.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { withinWindow } from '../insight.types';

const MIN_TRANSACTIONS = 5;
const MIN_PRICE_POINTS = 2;

function extractAmountCents(
  payload: Readonly<Record<string, unknown>> | undefined,
): number {
  if (!payload) return 0;

  const amount =
    payload['amountCents'] ??
    payload['amount_cents'] ??
    payload['amount'] ??
    payload['value'];
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string') return parseInt(amount, 10) || 0;
  return 0;
}

export function detectPricingElasticity(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 90;
  const insights: Insight[] = [];

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      (e.eventName === 'commerce.payment.approved' ||
        e.eventName === 'commerce.payment.declined' ||
        e.eventName === 'commerce.payment.initiated') &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  if (filtered.length < MIN_TRANSACTIONS) return { insights: [] };

  const priceVolumes = new Map<number, { approved: number; declined: number }>();
  for (const event of filtered) {
    const amount = extractAmountCents(event.payload);
    if (amount <= 0) continue;

    const entry = priceVolumes.get(amount) ?? { approved: 0, declined: 0 };
    if (event.eventName === 'commerce.payment.approved') {
      entry.approved++;
    } else if (event.eventName === 'commerce.payment.declined') {
      entry.declined++;
    }
    priceVolumes.set(amount, entry);
  }

  if (priceVolumes.size < MIN_PRICE_POINTS) return { insights: [] };

  const sorted = Array.from(priceVolumes.entries()).sort((a, b) => a[0] - b[0]);

  let maxApprovalRate = 0;
  let minApprovalRate = 1;
  let maxPricePoint = 0;
  let minPricePoint = sorted[0]?.[0] ?? 0;

  for (const [price, { approved, declined }] of sorted) {
    const total = approved + declined;
    if (total === 0) continue;
    const rate = approved / total;
    if (rate > maxApprovalRate) {
      maxApprovalRate = rate;
    }
    if (rate < minApprovalRate) {
      minApprovalRate = rate;
      maxPricePoint = price;
    }
  }

  if (maxApprovalRate - minApprovalRate >= 0.25 && maxPricePoint > minPricePoint) {
    const elasticityDrop = maxApprovalRate - minApprovalRate;
    const totalApproved = Array.from(priceVolumes.values()).reduce(
      (sum, v) => sum + v.approved,
      0,
    );

    insights.push({
      insightId: `insight_pe_${workspaceId}`,
      kind: 'pricing_elasticity',
      description: `conversion rate drops ${(elasticityDrop * 100).toFixed(0)}pp at higher price points (${maxPricePoint}c vs ${minPricePoint}c). ${totalApproved} total approved payments analyzed.`,
      evidence: [
        `price points analyzed: ${sorted.length}`,
        `highest approval rate: ${(maxApprovalRate * 100).toFixed(1)}% at ${minPricePoint}c`,
        `lowest approval rate: ${(minApprovalRate * 100).toFixed(1)}% at ${maxPricePoint}c`,
        `elasticity gap: ${(elasticityDrop * 100).toFixed(1)}pp`,
      ],
      estimatedFinancialImpactCents: Math.round(
        elasticityDrop * totalApproved * 50_00,
      ),
      confidence: Math.min(0.85, 0.4 + elasticityDrop * 1.2),
      recommendedChannel: 'dashboard',
      recommendedTiming: 'monthly',
      workspaceId,
      truthMode: 'inferred',
      generatedAt: new Date(nowMs).toISOString(),
    });
  }

  return { insights };
}
