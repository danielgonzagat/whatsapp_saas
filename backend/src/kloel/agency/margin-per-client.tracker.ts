/**
 * UTP-AGENCY-004 — Margin Per Client Tracker.
 *
 * Tracks profit margin per client — revenue, cost, net margin,
 * margin percentage, and trend direction based on previous
 * margin comparison.
 *
 * Pure function — stateless computation from input data.
 */

import type { MarginInput, MarginPerClient, MarginTrend } from './types';

export interface MarginResult {
  readonly margin: MarginPerClient;
  readonly profitable: boolean;
}

function computeTrend(deltaPercent: number): MarginTrend {
  if (deltaPercent > 0.05) {
    return 'improving';
  }
  if (deltaPercent < -0.05) {
    return 'declining';
  }
  if (deltaPercent < 0) {
    return 'stable';
  }
  return 'stable';
}

export function trackMargin(input: MarginInput): MarginResult {
  const nowMs = input.nowMs ?? Date.now();
  const marginCents = input.revenueCents - input.costCents;
  const marginPercent =
    input.revenueCents > 0n ? Number((marginCents * 10000n) / input.revenueCents) / 100 : 0;

  let trend: MarginTrend = 'stable';
  let trendDeltaPercent = 0;

  if (input.previousMarginPercent !== undefined) {
    trendDeltaPercent = Math.round((marginPercent - input.previousMarginPercent) * 100) / 100;
    trend = computeTrend(trendDeltaPercent);
  } else if (input.revenueCents > 0n) {
    trend = 'stable';
  } else {
    trend = 'negative';
  }

  const margin: MarginPerClient = {
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    revenueCents: input.revenueCents,
    costCents: input.costCents,
    marginCents,
    marginPercent: Math.round(marginPercent * 100) / 100,
    trend,
    trendDeltaPercent,
    assessedAt: new Date(nowMs).toISOString(),
  };

  const profitable = marginCents > 0n;

  return { margin, profitable };
}
