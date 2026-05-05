import { createHash } from 'node:crypto';
import { splitIdentifierTokensFromObservedName } from './dynamic-reality-kernel';

export type PulseSignalTruthMode = 'observed' | 'confirmed_static' | 'inferred' | 'weak_signal';

export interface PulseSignalLocation {
  file: string;
  line: number;
  column?: number;
}

export interface PulseSignalEvidence {
  source: string;
  detector: string;
  truthMode: PulseSignalTruthMode;
  summary: string;
  location: PulseSignalLocation;
  detail?: string;
}

export interface PulseSignalNode extends PulseSignalEvidence {
  id: string;
  confidence: number;
  tags: string[];
}

export interface PulseSignalGraph {
  generatedAt: string;
  nodes: PulseSignalNode[];
}

function signalEvidenceTokens(signal: PulseSignalEvidence): string[] {
  let value = [
    signal.source,
    signal.detector,
    signal.truthMode,
    signal.summary,
    signal.detail ?? '',
  ].join(' ');
  return [...splitIdentifierTokensFromObservedName(value)].filter((token) => token.length > 2);
}

function stableSignalId(signal: PulseSignalEvidence): string {
  return createHash('sha256')
    .update(
      [
        signal.source,
        signal.detector,
        signal.truthMode,
        signal.location.file,
        String(signal.location.line),
        signal.summary,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16);
}

function confidenceFor(signal: PulseSignalEvidence): number {
  let tokens = signalEvidenceTokens(signal);
  let runtimeDepth = tokens.filter((token) => token.includes('runtime')).length;
  let observedDepth = tokens.filter((token) => token.includes('observ')).length;
  let confirmationDepth = tokens.filter((token) => token.includes('confirm')).length;
  let staticDepth = tokens.filter((token) => token.includes('static')).length;
  let weakDepth = tokens.filter((token) => token.includes('weak')).length;
  let inferenceDepth = tokens.filter((token) => token.includes('infer')).length;
  let evidenceDepth = tokens.filter((token) => token.includes('evidence')).length;
  let probeDepth = tokens.filter((token) => token.includes('probe')).length;
  let denominator = Math.max(
    Number(Boolean(tokens.length)),
    tokens.length + runtimeDepth + probeDepth + evidenceDepth,
  );
  let rawScore =
    observedDepth * tokens.filter((token) => token.includes('observed')).join('').length +
    confirmationDepth * tokens.filter((token) => token.includes('confirmed')).join('').length +
    staticDepth * tokens.filter((token) => token.includes('static')).join('').length +
    runtimeDepth * tokens.filter((token) => token.includes('runtime')).join('').length +
    probeDepth * tokens.filter((token) => token.includes('probe')).join('').length +
    evidenceDepth +
    inferenceDepth -
    weakDepth * tokens.filter((token) => token.includes('weak')).join('').length;

  return Math.max(
    Number(Boolean(tokens.length)) / Math.max(tokens.length, Number(Boolean(tokens.length))),
    Math.min(1 - Number(!tokens.length), 0.2 + rawScore / denominator),
  );
}

function tagsFor(signal: PulseSignalEvidence): string[] {
  return [`truth:${signal.truthMode}`, `source:${signal.source}`, `detector:${signal.detector}`];
}

export function buildPulseSignalGraph(
  signals: readonly PulseSignalEvidence[],
  generatedAt: string = new Date().toISOString(),
): PulseSignalGraph {
  return {
    generatedAt,
    nodes: signals.map((signal) => ({
      ...signal,
      id: stableSignalId(signal),
      confidence: confidenceFor(signal),
      tags: tagsFor(signal),
    })),
  };
}
