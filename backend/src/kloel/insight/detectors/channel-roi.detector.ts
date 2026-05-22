/**
 * UTP-INSIGHT-007 — Channel ROI Detector.
 *
 * Compares per-channel cost vs attributed revenue. When channel
 * spend exceeds attributed revenue by a significant margin,
 * flags the underperforming channel.
 */

import type { DetectorInput, DetectorResult, Insight } from '../insight.types';
import { withinWindow } from '../insight.types';

const MIN_EVENTS = 3;
const POOR_ROI_THRESHOLD = 0.3;

function extractChannel(payload: Readonly<Record<string, unknown>> | undefined): string {
  if (!payload) return 'unknown';
  const ch = payload['channel'] ?? payload['source'] ?? payload['medium'];
  return typeof ch === 'string' ? ch : 'unknown';
}

function extractCostCents(payload: Readonly<Record<string, unknown>> | undefined): number {
  if (!payload) return 0;
  const cost =
    payload['costCents'] ?? payload['cost_cents'] ?? payload['spendCents'] ?? payload['spend'];
  if (typeof cost === 'number') return cost;
  if (typeof cost === 'string') return parseInt(cost, 10) || 0;
  return 0;
}

function extractRevenueCents(payload: Readonly<Record<string, unknown>> | undefined): number {
  if (!payload) return 0;
  const rev =
    payload['revenueCents'] ??
    payload['revenue_cents'] ??
    payload['amountCents'] ??
    payload['amount'];
  if (typeof rev === 'number') return rev;
  if (typeof rev === 'string') return parseInt(rev, 10) || 0;
  return 0;
}

export function detectChannelRoi(input: DetectorInput): DetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const windowDays = 90;
  const insights: Insight[] = [];

  const campaignEvents = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      (e.eventName === 'commerce.campaign.clicked' ||
        e.eventName === 'commerce.campaign.conversion_associated' ||
        e.eventName === 'commerce.campaign.audience_reached') &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  if (campaignEvents.length < MIN_EVENTS) return { insights: [] };

  const channelCosts = new Map<string, number>();
  const channelRevenue = new Map<string, number>();

  for (const event of campaignEvents) {
    const channel = extractChannel(event.payload);
    const cost = extractCostCents(event.payload);
    const revenue = extractRevenueCents(event.payload);

    if (cost > 0) {
      channelCosts.set(channel, (channelCosts.get(channel) ?? 0) + cost);
    }
    if (revenue > 0) {
      channelRevenue.set(channel, (channelRevenue.get(channel) ?? 0) + revenue);
    }
  }

  if (channelCosts.size === 0) return { insights: [] };

  for (const [channel, cost] of channelCosts) {
    const revenue = channelRevenue.get(channel) ?? 0;
    if (cost < 100_00) continue;

    if (revenue === 0 || revenue / cost < POOR_ROI_THRESHOLD) {
      const roi = revenue > 0 ? (revenue / cost).toFixed(2) : '0.00';
      const loss = Math.max(0, cost - revenue);

      insights.push({
        insightId: `insight_cr_${workspaceId}_${channel}`,
        kind: 'channel_roi',
        description: `channel "${channel}": cost ${cost}c, attributed revenue ${revenue}c (ROI ${roi}x). ${loss > 0 ? `Net loss of ${loss}c.` : 'Revenue not covering cost.'}`,
        evidence: [
          `channel: ${channel}`,
          `total cost: ${cost}c`,
          `attributed revenue: ${revenue}c`,
          `ROI: ${roi}x`,
        ],
        estimatedFinancialImpactCents: loss,
        confidence: Math.min(0.9, 0.5 + (1 - Math.min(1, revenue / Math.max(1, cost))) * 0.4),
        recommendedChannel: 'dashboard',
        recommendedTiming: 'monthly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  return { insights };
}
