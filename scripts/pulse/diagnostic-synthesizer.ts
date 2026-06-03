import type { PulseDynamicRiskResult } from './dynamic-risk-model';
import { buildEvidenceGraph, type PulseEvidenceGraph } from './evidence-graph';
import type { PulsePredicateGraph } from './predicate-graph';
import type { PulseSignalGraph, PulseSignalNode, PulseSignalTruthMode } from './signal-graph';

export interface PulseGeneratedDiagnostic {
  id: string;
  title: string;
  summary: string;
  riskScore: number;
  confidence: number;
  evidenceIds: string[];
  predicateKinds: string[];
  blockingEligible: boolean;
  proofMode: 'observed_or_confirmed' | 'requires_confirmation';
  proofContract: PulseDiagnosticProofContract;
}

export interface PulseDiagnosticSignalContract {
  id: string;
  source: string;
  detector: string;
  truthMode: PulseSignalTruthMode;
  summary: string;
  location: PulseSignalNode['location'];
  confidence: number;
}

export interface PulseDiagnosticPredicateContract {
  id: string;
  kind: string;
  signalIds: string[];
  confidence: number;
  summary: string;
}

export interface PulseDiagnosticProofContract {
  diagnosticId: string;
  generatedAt: string;
  rawSignals: PulseDiagnosticSignalContract[];
  predicates: PulseDiagnosticPredicateContract[];
}

function sentenceCase(value: string): string {
  const normalized = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? `${normalized[0]?.toUpperCase() ?? ''}${normalized.slice(1)}` : 'Finding';
}

function evidenceTruthDepth(signal: PulseSignalNode): number {
  const evidenceGraph = buildEvidenceGraph({ generatedAt: '', nodes: [signal] });
  const [evidence] = evidenceGraph.evidence;
  if (!evidence) return signal.confidence;

  const observedDepth = evidence.basis.filter((token) => token.includes('observ')).length;
  const confirmationDepth = evidence.basis.filter((token) => token.includes('confirm')).length;
  const staticDepth = evidence.basis.filter((token) => token.includes('static')).length;
  const weakDepth = evidence.basis.filter((token) => token.includes('weak')).length;
  const inferredDepth = evidence.basis.filter((token) => token.includes('infer')).length;

  return (
    signal.confidence +
    observedDepth +
    confirmationDepth +
    staticDepth -
    weakDepth -
    inferredDepth / 2
  );
}

function compareSignals(left: PulseSignalNode, right: PulseSignalNode): number {
  const truthDelta = evidenceTruthDepth(right) - evidenceTruthDepth(left);
  if (truthDelta !== 0) return truthDelta;
  const confidenceDelta = right.confidence - left.confidence;
  if (confidenceDelta !== 0) return confidenceDelta;
  return left.id.localeCompare(right.id);
}

function strongestSignal(signalGraph: PulseSignalGraph): PulseSignalNode | undefined {
  const [first] = [...signalGraph.nodes].sort(compareSignals);
  return first;
}

function hasBlockingGradeEvidence(signalGraph: PulseSignalGraph): boolean {
  const evidenceGraph = buildEvidenceGraph(signalGraph);
  return evidenceGraph.evidence.some((evidence) => {
    const hasObservedBasis = evidence.basis.some((token) => token.includes('observ'));
    const hasConfirmedBasis = evidence.basis.some((token) => token.includes('confirm'));
    const hasStaticBasis = evidence.basis.some((token) => token.includes('static'));
    return hasObservedBasis || (hasConfirmedBasis && hasStaticBasis);
  });
}

function predicateTruthPriority(
  signalIds: readonly string[],
  signalGraph: PulseSignalGraph,
): number {
  const signalsById = new Map(signalGraph.nodes.map((signal) => [signal.id, signal]));
  return signalIds.reduce((best, signalId) => {
    const signal = signalsById.get(signalId);
    return Math.max(best, signal ? evidenceTruthDepth(signal) : 0);
  }, 0);
}

function titleBasisFrom(
  signalGraph: PulseSignalGraph,
  predicateGraph: PulsePredicateGraph,
): string {
  const strongest = strongestSignal(signalGraph);
  if (strongest) {
    return strongest.summary;
  }

  const [predicate] = [...predicateGraph.predicates]
    .filter(
      (item) =>
        !item.kind.startsWith('truth_') &&
        !item.kind.startsWith('source_') &&
        !item.kind.startsWith('detector_'),
    )
    .sort((left, right) => {
      const truthDelta =
        predicateTruthPriority(right.signalIds, signalGraph) -
        predicateTruthPriority(left.signalIds, signalGraph);
      if (truthDelta !== 0) return truthDelta;
      const confidenceDelta = right.confidence - left.confidence;
      if (confidenceDelta !== 0) return confidenceDelta;
      return left.kind.localeCompare(right.kind);
    });

  return predicate?.kind ?? 'evidence_gap';
}

export function synthesizeDiagnostic(
  signalGraph: PulseSignalGraph,
  predicateGraph: PulsePredicateGraph,
  risk: PulseDynamicRiskResult,
  evidenceGraph: PulseEvidenceGraph = buildEvidenceGraph(signalGraph),
): PulseGeneratedDiagnostic {
  const predicateKinds = [...new Set(predicateGraph.predicates.map((predicate) => predicate.kind))];
  const titleBasis = titleBasisFrom(signalGraph, predicateGraph);
  const evidenceIds = signalGraph.nodes.map((signal) => signal.id);
  const id = `diagnostic:${signalGraph.generatedAt}:${evidenceIds.join('-')}`;
  const strongest = strongestSignal(signalGraph);
  const blockingEligible = hasBlockingGradeEvidence(signalGraph);
  const proofContract: PulseDiagnosticProofContract = {
    diagnosticId: id,
    generatedAt: signalGraph.generatedAt,
    rawSignals: evidenceGraph.evidence.map((evidence) => {
      const signal = signalGraph.nodes.find((item) => item.id === evidence.signalId);
      return {
        id: evidence.signalId,
        source: evidence.source,
        detector: evidence.detector,
        truthMode: signal?.truthMode ?? 'weak_signal',
        summary: evidence.summary,
        location: evidence.location,
        confidence: evidence.confidence,
      };
    }),
    predicates: predicateGraph.predicates.map((predicate) => ({
      id: predicate.id,
      kind: predicate.kind,
      signalIds: predicate.signalIds,
      confidence: predicate.confidence,
      summary: predicate.summary,
    })),
  };

  return {
    id,
    title: sentenceCase(titleBasis),
    summary: `${strongest?.summary ?? 'Evidence collected by Pulse'}; predicates=${predicateKinds.join(', ') || 'none'}`,
    riskScore: risk.score,
    confidence: Math.min(risk.confidence, strongest?.confidence ?? risk.confidence),
    evidenceIds,
    predicateKinds,
    blockingEligible,
    proofMode: blockingEligible ? 'observed_or_confirmed' : 'requires_confirmation',
    proofContract,
  };
}
