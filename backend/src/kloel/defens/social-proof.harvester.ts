import { Injectable } from '@nestjs/common';
import type { SocialProof, ProofKind, EvidenceInput } from './types';
import { clamp, filterByWorkspace } from './types';

/**
 * DEFENS-004 — SocialProofHarvester.
 *
 * Harvests social proof from spine events: testimonials, reviews,
 * case studies, numeric results, endorsements, and media mentions.
 * Each proof item has credibility and visibility scores.
 */

const PROOF_SIGNAL_MAP: Readonly<Record<string, ProofKind>> = {
  'commerce.crm.deal_won': 'numeric_result',
  'commerce.lead.converted': 'numeric_result',
  'commerce.affiliate.performance_measured': 'numeric_result',
  'commerce.campaign.conversion_associated': 'numeric_result',
};

@Injectable()
export class SocialProofHarvester {
  private readonly store = new Map<string, SocialProof[]>();

  harvest(input: EvidenceInput): readonly SocialProof[] {
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const results: SocialProof[] = [];

    for (const event of wsEvents) {
      const kind = PROOF_SIGNAL_MAP[event.eventName];
      if (!kind) continue;

      const proofId = `${input.workspaceId}_${kind}_${event.eventId}`;

      const existing = this.store.get(input.workspaceId) ?? [];
      if (existing.some((p) => p.proofId === proofId)) continue;

      const credibility = this.computeCredibility(kind, event);
      const visibility = this.computeVisibility(kind);
      const summary = this.buildSummary(event.eventName);

      const proof: SocialProof = {
        workspaceId: input.workspaceId,
        proofId,
        kind,
        source: event.eventName,
        url: undefined,
        summary,
        credibilityScore: credibility,
        visibilityScore: visibility,
        recordedAt: nowIso,
      };

      results.push(proof);
      existing.push(proof);
      this.store.set(input.workspaceId, existing);
    }

    return results;
  }

  list(workspaceId: string): readonly SocialProof[] {
    return this.store.get(workspaceId) ?? [];
  }

  aggregate(workspaceId: string): { readonly proofCount: number; readonly avgCredibility: number; readonly avgVisibility: number } {
    const proofs = this.list(workspaceId);
    if (proofs.length === 0) {
      return { proofCount: 0, avgCredibility: 0, avgVisibility: 0 };
    }

    const totalCred = proofs.reduce((s, p) => s + p.credibilityScore, 0);
    const totalVis = proofs.reduce((s, p) => s + p.visibilityScore, 0);

    return {
      proofCount: proofs.length,
      avgCredibility: Math.round((totalCred / proofs.length) * 1000) / 1000,
      avgVisibility: Math.round((totalVis / proofs.length) * 1000) / 1000,
    };
  }

  private computeCredibility(kind: ProofKind, _event: { payload?: Readonly<Record<string, unknown>> }): number {
    const base: Readonly<Record<ProofKind, number>> = {
      testimonial: 0.6,
      review: 0.7,
      case_study: 0.85,
      numeric_result: 0.9,
      endorsement: 0.75,
      media_mention: 0.65,
    };
    return clamp(base[kind], 0, 1);
  }

  private computeVisibility(kind: ProofKind): number {
    const base: Readonly<Record<ProofKind, number>> = {
      testimonial: 0.4,
      review: 0.8,
      case_study: 0.7,
      numeric_result: 0.5,
      endorsement: 0.9,
      media_mention: 0.85,
    };
    return clamp(base[kind], 0, 1);
  }

  private buildSummary(eventName: string): string {
    const summaries: Readonly<Record<string, string>> = {
      'commerce.crm.deal_won': 'Closed deal — revenue proof point',
      'commerce.lead.converted': 'Lead converted — conversion track record',
      'commerce.affiliate.performance_measured': 'Affiliate performance result',
      'commerce.campaign.conversion_associated': 'Campaign-driven conversion',
    };
    return summaries[eventName] ?? `Proof event: ${eventName}`;
  }
}
