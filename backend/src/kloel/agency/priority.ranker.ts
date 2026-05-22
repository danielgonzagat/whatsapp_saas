/**
 * UTP-AGENCY-003 — Priority Ranker.
 *
 * Ranks clients by priority based on revenue contribution,
 * churn indicators, relationship recency, and open issues.
 * Produces a scored, tiered ranking for each client.
 *
 * Pure function — stateless ranking from input bundles.
 */

import type { ClientContextBundle, PriorityInput, PriorityRanking, PriorityTier } from './types';
import { HIGH_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD, clampScore, daysSince } from './types';

export interface RankerResult {
  readonly rankings: readonly PriorityRanking[];
  readonly topClient: PriorityRanking | null;
}

function computePriorityScore(
  bundle: ClientContextBundle,
  nowMs: number,
  maxRevenue: bigint,
): number {
  const revenueWeight =
    maxRevenue > 0n ? Number(bundle.monthlyRevenueCents) / Number(maxRevenue) : 0;
  const daysSinceContact = daysSince(bundle.lastContactAt, nowMs);
  const recencyWeight = Math.max(0, 1 - daysSinceContact / 30);
  const issueWeight = Math.max(0, 1 - bundle.openIssues / 10);
  const satisfactionWeight = bundle.satisfactionScore;

  const raw =
    revenueWeight * 0.35 + recencyWeight * 0.25 + issueWeight * 0.15 + satisfactionWeight * 0.25;
  return clampScore(raw);
}

function tierFromScore(score: number): PriorityTier {
  if (score >= HIGH_PRIORITY_THRESHOLD) {
    return 'agora';
  }
  if (score >= MEDIUM_PRIORITY_THRESHOLD) {
    return 'esta_semana';
  }
  if (score >= 0.2) {
    return 'em_breve';
  }
  return 'sustentar';
}

function identifyDrivers(bundle: ClientContextBundle, nowMs: number): readonly string[] {
  const drivers: string[] = [];
  if (bundle.openIssues > 3) {
    drivers.push('open_issues');
  }
  const sinceContact = daysSince(bundle.lastContactAt, nowMs);
  if (sinceContact > 14) {
    drivers.push('stale_contact');
  }
  if (bundle.satisfactionScore < 0.5) {
    drivers.push('low_satisfaction');
  }
  if (bundle.contractRenewalAt) {
    const daysToRenewal = daysSince(bundle.contractRenewalAt, nowMs);
    if (daysToRenewal < 0 && Math.abs(daysToRenewal) < 30) {
      drivers.push('renewal_due');
    }
  }
  if (drivers.length === 0) {
    drivers.push('sustained_health');
  }
  return drivers;
}

export function rankPriorities(input: PriorityInput): RankerResult {
  const nowMs = input.nowMs ?? Date.now();
  const bundles = input.bundles;

  if (bundles.length === 0) {
    return { rankings: [], topClient: null };
  }

  const maxRevenue = bundles.reduce(
    (max, b) => (b.monthlyRevenueCents > max ? b.monthlyRevenueCents : max),
    0n,
  );

  const rankings: PriorityRanking[] = bundles
    .map((bundle) => {
      const score = computePriorityScore(bundle, nowMs, maxRevenue);
      const tier = tierFromScore(score);
      const drivers = identifyDrivers(bundle, nowMs);
      return {
        clientId: bundle.clientId,
        workspaceId: bundle.workspaceId,
        rank: 0,
        score: Math.round(score * 100) / 100,
        tier,
        drivers,
        rankedAt: new Date(nowMs).toISOString(),
      };
    })
    .sort((a, b) => b.score - a.score);

  for (let i = 0; i < rankings.length; i++) {
    rankings[i] = { ...rankings[i]!, rank: i + 1 };
  }

  return {
    rankings,
    topClient: rankings.length > 0 ? rankings[0]! : null,
  };
}
