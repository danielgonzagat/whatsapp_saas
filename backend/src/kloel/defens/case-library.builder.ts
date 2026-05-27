import { Injectable } from '@nestjs/common';
import type { CaseLibrary, CaseOutcomeKind, CaseMetric, EvidenceInput } from './types';
import { clamp, filterByWorkspace } from './types';

/**
 * DEFENS-005 — CaseLibraryBuilder.
 *
 * Builds a case study library from operational outcomes. Each case
 * captures an outcome kind, quantified metrics, proof count from
 * associated social proof events, and a reusability score that
 * indicates how well this case can be presented to new prospects.
 */

const OUTCOME_EVENT_MAP: Readonly<Record<string, CaseOutcomeKind>> = {
  'commerce.crm.deal_won': 'revenue_growth',
  'commerce.lead.converted': 'revenue_growth',
  'commerce.member_area.progressed': 'capability_unlocked',
  'commerce.member_area.enrolled': 'audience_growth',
  'commerce.affiliate.performance_measured': 'revenue_growth',
  'commerce.campaign.audience_reached': 'audience_growth',
};

@Injectable()
export class CaseLibraryBuilder {
  private readonly store = new Map<string, CaseLibrary[]>();

  build(input: EvidenceInput): readonly CaseLibrary[] {
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const results: CaseLibrary[] = [];

    let caseIndex = 0;

    for (const event of wsEvents) {
      const outcomeKind = OUTCOME_EVENT_MAP[event.eventName];
      if (!outcomeKind) {continue;}

      caseIndex++;
      const caseId = `${input.workspaceId}_case_${caseIndex}`;

      const metrics = this.extractMetrics(event);
      const proofCount = this.countRelatedProofs(input.workspaceId, outcomeKind);
      const title = this.buildTitle(outcomeKind, caseIndex);
      const summary = this.buildOutcomeSummary(outcomeKind, metrics);

      const entry: CaseLibrary = {
        workspaceId: input.workspaceId,
        caseId,
        title,
        outcomeKind,
        outcomeSummary: summary,
        metrics,
        proofCount,
        reusabilityScore: this.computeReusability(outcomeKind, metrics, proofCount),
        recordedAt: nowIso,
      };

      results.push(entry);
      const existing = this.store.get(input.workspaceId) ?? [];
      existing.push(entry);
      this.store.set(input.workspaceId, existing);
    }

    return results;
  }

  list(workspaceId: string): readonly CaseLibrary[] {
    return this.store.get(workspaceId) ?? [];
  }

  topReusable(workspaceId: string, limit: number): readonly CaseLibrary[] {
    return this.list(workspaceId)
      .slice()
      .sort((a, b) => b.reusabilityScore - a.reusabilityScore)
      .slice(0, limit);
  }

  private extractMetrics(event: { payload?: Readonly<Record<string, unknown>> }): CaseMetric[] {
    const payload = event.payload ?? {};
    const metrics: CaseMetric[] = [];

    if (typeof payload['revenueCents'] === 'number') {
      metrics.push({ label: 'Revenue', value: `$${(payload['revenueCents'] / 100).toFixed(2)}`, trend: 'up' });
    }
    if (typeof payload['audienceSize'] === 'number') {
      metrics.push({ label: 'Audience', value: String(payload['audienceSize']), trend: 'up' });
    }
    if (typeof payload['conversionRate'] === 'number') {
      metrics.push({ label: 'Conversion', value: `${(payload['conversionRate'] * 100).toFixed(1)}%`, trend: 'up' });
    }
    if (typeof payload['timeToClose'] === 'number') {
      metrics.push({ label: 'Time to Close', value: `${payload['timeToClose']}d`, trend: 'down' });
    }

    if (metrics.length === 0) {
      metrics.push({ label: 'Outcome', value: 'achieved', trend: 'up' });
    }

    return metrics;
  }

  private buildTitle(outcomeKind: CaseOutcomeKind, index: number): string {
    const prefix: Readonly<Record<CaseOutcomeKind, string>> = {
      revenue_growth: 'Revenue Growth',
      cost_reduction: 'Cost Reduction',
      time_saved: 'Time Saved',
      risk_mitigated: 'Risk Mitigated',
      audience_growth: 'Audience Growth',
      capability_unlocked: 'Capability Unlocked',
    };
    return `${prefix[outcomeKind]} — Case #${index}`;
  }

  private buildOutcomeSummary(outcomeKind: CaseOutcomeKind, metrics: readonly CaseMetric[]): string {
    const metricSummary = metrics.map((m) => `${m.label}: ${m.value}`).join(', ');
    const kindSummary: Readonly<Record<CaseOutcomeKind, string>> = {
      revenue_growth: 'Revenue increase achieved',
      cost_reduction: 'Cost reduction delivered',
      time_saved: 'Operational time saved',
      risk_mitigated: 'Business risk mitigated',
      audience_growth: 'Audience expanded',
      capability_unlocked: 'New capability unlocked',
    };
    return `${kindSummary[outcomeKind]} — ${metricSummary}`;
  }

  private computeReusability(outcomeKind: CaseOutcomeKind, metrics: readonly CaseMetric[], proofCount: number): number {
    const metricCount = metrics.length;
    const hasQuantified = metricCount > 1;

    const kindScore: Readonly<Record<CaseOutcomeKind, number>> = {
      revenue_growth: 0.9,
      cost_reduction: 0.8,
      time_saved: 0.7,
      risk_mitigated: 0.6,
      audience_growth: 0.75,
      capability_unlocked: 0.65,
    };

    let score = kindScore[outcomeKind];
    if (hasQuantified) {score += 0.1;}
    if (proofCount > 0) {score += Math.min(0.1, proofCount * 0.02);}

    return clamp(score, 0, 1);
  }

  private countRelatedProofs(_workspaceId: string, _outcomeKind: CaseOutcomeKind): number {
    return 0;
  }
}
