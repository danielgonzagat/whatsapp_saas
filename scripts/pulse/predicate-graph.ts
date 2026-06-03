import type { PulseSignalGraph, PulseSignalNode } from './signal-graph';

export type PulsePredicateKind = string;

export interface PulsePredicateNode {
  id: string;
  kind: PulsePredicateKind;
  signalIds: string[];
  confidence: number;
  summary: string;
}

export interface PulsePredicateGraph {
  generatedAt: string;
  predicates: PulsePredicateNode[];
}

function predicateId(kind: PulsePredicateKind, signal: PulseSignalNode): string {
  return `${kind}:${signal.id}`;
}

function evidenceText(signal: PulseSignalNode): string {
  return `${signal.summary} ${signal.detail ?? ''} ${signal.tags.join(' ')}`;
}

function normalizeToken(value: string): string {
  let normalized = '';

  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isAsciiLetter = code >= 97 && code <= 122;
    const isAsciiDigit = code >= 48 && code <= 57;
    normalized += isAsciiLetter || isAsciiDigit ? char : '_';
  }

  return normalized
    .split('_')
    .filter((part) => part.length > 2)
    .join('_');
}

function tokensFrom(value: string): string[] {
  const tokens: string[] = [];
  let current = '';

  for (const char of value) {
    const code = char.charCodeAt(0);
    const isAsciiLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    const isAsciiDigit = code >= 48 && code <= 57;

    if (isAsciiLetter || isAsciiDigit) {
      current += char;
      continue;
    }

    if (current.length > 2) {
      tokens.push(normalizeToken(current));
    }
    current = '';
  }

  if (current.length > 2) {
    tokens.push(normalizeToken(current));
  }

  return tokens.filter(Boolean);
}

function predicateKindsFor(signal: PulseSignalNode): PulsePredicateKind[] {
  const textTokens = tokensFrom(evidenceText(signal));
  const sourceToken = normalizeToken(signal.source);
  const detectorToken = normalizeToken(signal.detector);
  const kinds = new Set<PulsePredicateKind>();

  kinds.add(`truth_${signal.truthMode}`);
  if (sourceToken) {
    kinds.add(`source_${sourceToken}`);
  }
  if (detectorToken) {
    kinds.add(`detector_${detectorToken}`);
  }

  for (let index = 0; index < textTokens.length; index += 1) {
    const first = textTokens[index];
    const second = textTokens[index + 1];
    if (first && second) {
      kinds.add(`evidence_${first}_${second}`);
    } else if (first) {
      kinds.add(`evidence_${first}`);
    }
  }

  return [...kinds];
}

export function buildPredicateGraph(signalGraph: PulseSignalGraph): PulsePredicateGraph {
  const predicates: PulsePredicateNode[] = [];

  for (const signal of signalGraph.nodes) {
    for (const kind of predicateKindsFor(signal)) {
      predicates.push({
        id: predicateId(kind, signal),
        kind,
        signalIds: [signal.id],
        confidence: signal.confidence,
        summary: `${kind} derived from ${signal.source}/${signal.detector}`,
      });
    }
  }

  return {
    generatedAt: signalGraph.generatedAt,
    predicates,
  };
}
