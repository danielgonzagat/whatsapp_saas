import type { PulseDynamicRiskResult } from './dynamic-risk-model';
import type { PulsePredicateGraph } from './predicate-graph';
import type { PulseSignalGraph } from './signal-graph';

export interface PulseGeneratedDiagnostic {
  id: string;
  title: string;
  summary: string;
  riskScore: number;
  confidence: number;
  evidenceIds: string[];
  predicateKinds: string[];
}

function sentenceCase(value: string): string {
  const normalized = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? `${normalized[0]?.toUpperCase() ?? ''}${normalized.slice(1)}` : 'Finding';
}

function strongestEvidence(signalGraph: PulseSignalGraph): string {
  const [first] = [...signalGraph.nodes].sort((left, right) => right.confidence - left.confidence);
  return first?.summary ?? 'Evidence collected by Pulse';
}

export function synthesizeDiagnostic(
  signalGraph: PulseSignalGraph,
  predicateGraph: PulsePredicateGraph,
  risk: PulseDynamicRiskResult,
): PulseGeneratedDiagnostic {
  const predicateKinds = [...new Set(predicateGraph.predicates.map((predicate) => predicate.kind))];
  const titleBasis = predicateKinds[0] ?? 'evidence_gap';
  const evidenceIds = signalGraph.nodes.map((signal) => signal.id);
  const id = `diagnostic:${signalGraph.generatedAt}:${evidenceIds.join('-')}`;

  return {
    id,
    title: sentenceCase(titleBasis),
    summary: `${strongestEvidence(signalGraph)}; predicates=${predicateKinds.join(', ') || 'none'}`,
    riskScore: risk.score,
    confidence: Math.min(risk.confidence, signalGraph.nodes[0]?.confidence ?? risk.confidence),
    evidenceIds,
    predicateKinds,
  };
}
