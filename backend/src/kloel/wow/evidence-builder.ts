/**
 * UTP-WOW-004 — Evidence Builder.
 *
 * Packages each insight with traceable evidence. Every evidence item
 * carries provenance (processor, version), truthMode, and weight.
 * The builder walks the insight's evidence strings and converts them
 * into structured EvidenceItem objects with origin tracking.
 *
 * Pure function — no DI required.
 */

import type { RankedWOWInsight, EvidenceBundle, EvidenceItem } from './wow.types';

const PROCESSOR_NAME = 'wow-evidence-builder';
const PROCESSOR_VERSION = '1.0.0';

export function buildEvidence(insight: RankedWOWInsight): EvidenceBundle {
  const items: EvidenceItem[] = insight.evidence.map((ev, idx) => ({
    description: ev,
    truthMode: 'inferred' as const,
    provenance: {
      processor: PROCESSOR_NAME,
      processorVersion: PROCESSOR_VERSION,
    },
    weight: 1.0 / (idx + 1),
  }));

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);

  return {
    insight,
    evidenceItems: items,
    assembledAt: new Date().toISOString(),
    totalEvidenceWeight: totalWeight,
  };
}

export function buildEvidenceBundles(
  insights: readonly RankedWOWInsight[],
): readonly EvidenceBundle[] {
  return insights.map((i) => buildEvidence(i));
}
