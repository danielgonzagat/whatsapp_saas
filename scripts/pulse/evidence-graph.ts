import type { PulseSignalGraph, PulseSignalNode } from './signal-graph';
import { splitIdentifierTokensFromObservedName } from './dynamic-reality-kernel';

export interface PulseEvidenceNode {
  id: string;
  signalId: string;
  source: string;
  detector: string;
  location: PulseSignalNode['location'];
  confidence: number;
  basis: string[];
  summary: string;
}

export interface PulseEvidenceGraph {
  generatedAt: string;
  evidence: PulseEvidenceNode[];
}

function normalizedEvidenceTokens(value: string): string[] {
  return [...splitIdentifierTokensFromObservedName(value)].filter((token) => token.length > 2);
}

export function deriveEvidenceBasis(signal: PulseSignalNode): string[] {
  return normalizedEvidenceTokens(
    [signal.source, signal.detector, signal.truthMode, signal.summary, signal.detail ?? ''].join(
      ' ',
    ),
  );
}

export function buildEvidenceGraph(signalGraph: PulseSignalGraph): PulseEvidenceGraph {
  return {
    generatedAt: signalGraph.generatedAt,
    evidence: signalGraph.nodes.map((signal) => ({
      id: `evidence:${signal.id}`,
      signalId: signal.id,
      source: signal.source,
      detector: signal.detector,
      location: signal.location,
      confidence: signal.confidence,
      basis: deriveEvidenceBasis(signal),
      summary: signal.summary,
    })),
  };
}
