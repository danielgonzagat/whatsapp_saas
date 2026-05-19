import { Injectable } from '@nestjs/common';
import type { PositioningUniqueness, PositioningSignalKind, EvidenceInput } from './types';
import { clamp, filterByWorkspace } from './types';

/**
 * DEFENS-006 — PositioningUniquenessDetector.
 *
 * Detects unique positioning signals from operational patterns.
 * Analyzes spine events for signals of price premium, category
 * creation, unique methodology, exclusive data, network effects,
 * and regulatory moat. Computes competitor overlap as a proxy
 * for uniqueness dilution.
 */

const POSITIONING_SIGNALS: Readonly<Record<string, PositioningSignalKind>> = {
  'commerce.lead.objection_raised': 'price_premium',
  'commerce.crm.stage_changed': 'unique_methodology',
  'commerce.member_area.enrolled': 'network_effects',
  'commerce.affiliate.performance_measured': 'network_effects',
  'commerce.campaign.audience_reached': 'exclusive_data',
  'commerce.lead.converted': 'category_creation',
};

@Injectable()
export class PositioningUniquenessDetector {
  detect(input: EvidenceInput): readonly PositioningUniqueness[] {
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const signalMap = new Map<PositioningSignalKind, { strength: number; evidence: string[] }>();

    for (const event of wsEvents) {
      const signalKind = POSITIONING_SIGNALS[event.eventName];
      if (!signalKind) continue;

      const existing = signalMap.get(signalKind) ?? { strength: 0, evidence: [] };
      const increment = this.signalIncrement(event.eventName);

      signalMap.set(signalKind, {
        strength: clamp(existing.strength + increment, 0, 1),
        evidence: [...existing.evidence, event.eventId].slice(-20),
      });
    }

    const allKinds: PositioningSignalKind[] = [
      'price_premium',
      'category_creation',
      'unique_methodology',
      'exclusive_data',
      'network_effects',
      'regulatory_moat',
    ];

    return allKinds.map((kind) => {
      const data = signalMap.get(kind) ?? { strength: 0, evidence: [] };
      return {
        workspaceId: input.workspaceId,
        signalKind: kind,
        strength: Math.round(data.strength * 1000) / 1000,
        evidence: data.evidence,
        competitorOverlap: this.computeCompetitorOverlap(kind),
        assessedAt: nowIso,
      };
    });
  }

  overallUniqueness(signals: readonly PositioningUniqueness[]): number {
    if (signals.length === 0) return 0;
    const totalStrength = signals.reduce((s, sig) => s + sig.strength * (1 - sig.competitorOverlap), 0);
    return Math.round(clamp(totalStrength / signals.length, 0, 1) * 1000) / 1000;
  }

  private signalIncrement(eventName: string): number {
    const weights: Readonly<Record<string, number>> = {
      'commerce.lead.objection_raised': 0.05,
      'commerce.crm.stage_changed': 0.08,
      'commerce.member_area.enrolled': 0.1,
      'commerce.affiliate.performance_measured': 0.12,
      'commerce.campaign.audience_reached': 0.06,
      'commerce.lead.converted': 0.1,
    };
    return weights[eventName] ?? 0.05;
  }

  private computeCompetitorOverlap(kind: PositioningSignalKind): number {
    const inherentOverlap: Readonly<Record<PositioningSignalKind, number>> = {
      price_premium: 0.4,
      category_creation: 0.1,
      unique_methodology: 0.2,
      exclusive_data: 0.15,
      network_effects: 0.3,
      regulatory_moat: 0.05,
    };
    return inherentOverlap[kind] ?? 0.3;
  }
}
