import { createHash } from 'node:crypto';

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

function confidenceFor(mode: PulseSignalTruthMode): number {
  if (mode === 'observed') return 0.95;
  if (mode === 'confirmed_static') return 0.8;
  if (mode === 'inferred') return 0.55;
  return 0.25;
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
      confidence: confidenceFor(signal.truthMode),
      tags: tagsFor(signal),
    })),
  };
}
