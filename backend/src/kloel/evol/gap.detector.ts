import { Injectable } from '@nestjs/common';
import type { SelfGap, GapSeverity, CommercialImpact } from './types';
import { commercialImpactWeight, clamp } from './types';

/**
 * EVOL-001 — GapDetector.
 *
 * Identifies own gaps (missing capabilities, quality dips, dead code)
 * and estimates commercial impact. Scans spine events and module health
 * signals to produce a ranked list of gaps with revenue risk estimates.
 */

export interface GapSignal {
  readonly eventName: string;
  readonly workspaceId: string;
  readonly domain: string;
  readonly severityScore: number;
  readonly revenueRiskCents: number;
}

const DOMAIN_RISK_PROFILES: Readonly<
  Record<string, { readonly severity: GapSeverity; readonly impact: CommercialImpact; readonly baseRiskCents: number }>
> = {
  payments: { severity: 'critical', impact: 'revenue_blocking', baseRiskCents: 100000 },
  wallet: { severity: 'critical', impact: 'revenue_blocking', baseRiskCents: 50000 },
  auth: { severity: 'high', impact: 'trust_eroding', baseRiskCents: 20000 },
  whatsapp: { severity: 'high', impact: 'revenue_blocking', baseRiskCents: 30000 },
  checkout: { severity: 'high', impact: 'revenue_blocking', baseRiskCents: 75000 },
  kyc: { severity: 'high', impact: 'trust_eroding', baseRiskCents: 15000 },
  billing: { severity: 'medium', impact: 'revenue_blocking', baseRiskCents: 10000 },
  crm: { severity: 'medium', impact: 'opportunity_missed', baseRiskCents: 5000 },
  autopilot: { severity: 'medium', impact: 'quality_degrading', baseRiskCents: 8000 },
  flows: { severity: 'low', impact: 'quality_degrading', baseRiskCents: 3000 },
  dashboard: { severity: 'low', impact: 'quality_degrading', baseRiskCents: 2000 },
};

@Injectable()
export class GapDetector {
  private gapCounter = 0;

  detect(signals: readonly GapSignal[]): readonly SelfGap[] {
    const now = new Date().toISOString();
    const gaps: SelfGap[] = [];

    for (const signal of signals) {
      const profile = DOMAIN_RISK_PROFILES[signal.domain];
      if (!profile) {continue;}

      const confidence = clamp([0, 1], signal.severityScore);

      if (confidence < 0.3) {continue;}

      const projectedRisk =
        Math.round(profile.baseRiskCents * signal.severityScore * commercialImpactWeight(profile.impact));

      this.gapCounter += 1;

      gaps.push({
        id: `gap-${signal.workspaceId}-${this.gapCounter}`,
        workspaceId: signal.workspaceId,
        domain: signal.domain,
        description: `Detected capability gap in ${signal.domain} domain`,
        severity: profile.severity,
        commercialImpact: profile.impact,
        estimatedRevenueRiskCents: projectedRisk,
        detectedAt: now,
        sourceEvidence: [signal.eventName],
        confidence,
      });
    }

    return gaps.sort((a, b) => b.estimatedRevenueRiskCents - a.estimatedRevenueRiskCents);
  }

  rankByCommercialImpact(gaps: readonly SelfGap[]): readonly SelfGap[] {
    return [...gaps].sort(
      (a, b) =>
        commercialImpactWeight(b.commercialImpact) * b.estimatedRevenueRiskCents -
        commercialImpactWeight(a.commercialImpact) * a.estimatedRevenueRiskCents,
    );
  }

  estimateTotalRisk(gaps: readonly SelfGap[]): number {
    return gaps.reduce((sum, g) => sum + g.estimatedRevenueRiskCents, 0);
  }

  resetCounter(): void {
    this.gapCounter = 0;
  }
}
