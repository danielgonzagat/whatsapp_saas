import { normalizePath } from './scope-state.codacy';

export type PulseFindingTruthMode = 'observed' | 'confirmed_static' | 'inferred' | 'weak_signal';

export type PulseFindingActionability = 'fix_now' | 'needs_probe' | 'needs_context' | 'ignore';

export type PulseFalsePositiveRisk = 'low' | 'medium' | 'high';

export type PulseSignalEvidenceKind =
  | 'regex'
  | 'list'
  | 'fixed_name'
  | 'ast'
  | 'dataflow'
  | 'static_confirmed'
  | 'runtime'
  | 'external'
  | 'structural'
  | 'manual';

export interface PulseRawSignal {
  detector: string;
  type: string;
  filePath: string;
  line?: number | null;
  evidence: string;
  evidenceKind: PulseSignalEvidenceKind;
  message?: string;
  executed?: boolean;
  blocking?: boolean;
  ignored?: boolean;
  falsePositiveRisk?: PulseFalsePositiveRisk;
}

export interface PulseEvidenceChainItem {
  detector: string;
  evidenceKind: PulseSignalEvidenceKind;
  evidence: string;
  truthMode: PulseFindingTruthMode;
  executed: boolean;
  message: string | null;
}

export interface PulseVerifiedFinding {
  detector: string;
  type: string;
  filePath: string;
  line: number | null;
  evidence: string;
  truthMode: PulseFindingTruthMode;
  actionability: PulseFindingActionability;
  falsePositiveRisk: PulseFalsePositiveRisk;
  blocking: boolean;
  evidenceChain: PulseEvidenceChainItem[];
}

const TRUTH_MODE_RANK: Record<PulseFindingTruthMode, number> = {
  weak_signal: 0,
  inferred: 1,
  confirmed_static: 2,
  observed: 3,
};

const ACTIONABILITY_RANK: Record<PulseFindingActionability, number> = {
  ignore: 0,
  needs_context: 1,
  needs_probe: 2,
  fix_now: 3,
};

const FALSE_POSITIVE_RISK_RANK: Record<PulseFalsePositiveRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const WEAK_SIGNAL_KINDS = new Set<PulseSignalEvidenceKind>(['regex', 'list', 'fixed_name']);
const CONFIRMED_STATIC_KINDS = new Set<PulseSignalEvidenceKind>([
  'ast',
  'dataflow',
  'static_confirmed',
]);
const OBSERVED_KINDS = new Set<PulseSignalEvidenceKind>(['runtime', 'external']);

function normalizeLine(line: number | null | undefined): number | null {
  if (typeof line !== 'number' || !Number.isFinite(line) || line < 1) {
    return null;
  }
  return Math.trunc(line);
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function classifyTruthMode(signal: PulseRawSignal): PulseFindingTruthMode {
  if (signal.executed === true && OBSERVED_KINDS.has(signal.evidenceKind)) {
    return 'observed';
  }

  if (CONFIRMED_STATIC_KINDS.has(signal.evidenceKind)) {
    return 'confirmed_static';
  }

  if (WEAK_SIGNAL_KINDS.has(signal.evidenceKind)) {
    return 'weak_signal';
  }

  return 'inferred';
}

function defaultFalsePositiveRisk(truthMode: PulseFindingTruthMode): PulseFalsePositiveRisk {
  if (truthMode === 'observed' || truthMode === 'confirmed_static') {
    return 'low';
  }
  if (truthMode === 'inferred') {
    return 'medium';
  }
  return 'high';
}

function classifyActionability(
  signal: PulseRawSignal,
  truthMode: PulseFindingTruthMode,
): PulseFindingActionability {
  if (signal.ignored === true) {
    return 'ignore';
  }
  if (truthMode === 'observed' || truthMode === 'confirmed_static') {
    return 'fix_now';
  }
  if (truthMode === 'weak_signal') {
    return 'needs_probe';
  }
  return 'needs_context';
}

function canBlock(signal: PulseRawSignal, truthMode: PulseFindingTruthMode): boolean {
  if (signal.ignored === true || truthMode === 'weak_signal') {
    return false;
  }
  return signal.blocking === true && (truthMode === 'observed' || truthMode === 'confirmed_static');
}

function evidenceChainItem(
  signal: PulseRawSignal,
  truthMode: PulseFindingTruthMode,
): PulseEvidenceChainItem {
  return {
    detector: signal.detector,
    evidenceKind: signal.evidenceKind,
    evidence: normalizeText(signal.evidence),
    truthMode,
    executed: signal.executed === true,
    message: signal.message ? normalizeText(signal.message) : null,
  };
}

function strongestTruthMode(items: readonly PulseEvidenceChainItem[]): PulseFindingTruthMode {
  return items.reduce<PulseFindingTruthMode>((best, item) => {
    return TRUTH_MODE_RANK[item.truthMode] > TRUTH_MODE_RANK[best] ? item.truthMode : best;
  }, 'weak_signal');
}

function strongestActionability(
  values: readonly PulseFindingActionability[],
): PulseFindingActionability {
  return values.reduce<PulseFindingActionability>((best, value) => {
    return ACTIONABILITY_RANK[value] > ACTIONABILITY_RANK[best] ? value : best;
  }, 'ignore');
}

function lowestFalsePositiveRisk(
  values: readonly PulseFalsePositiveRisk[],
): PulseFalsePositiveRisk {
  return values.reduce<PulseFalsePositiveRisk>((best, value) => {
    return FALSE_POSITIVE_RISK_RANK[value] < FALSE_POSITIVE_RISK_RANK[best] ? value : best;
  }, 'high');
}

function highestFalsePositiveRisk(
  values: readonly PulseFalsePositiveRisk[],
): PulseFalsePositiveRisk {
  return values.reduce<PulseFalsePositiveRisk>((best, value) => {
    return FALSE_POSITIVE_RISK_RANK[value] > FALSE_POSITIVE_RISK_RANK[best] ? value : best;
  }, 'low');
}

function dedupeKey(
  signal: Pick<PulseRawSignal, 'detector' | 'type' | 'filePath' | 'line' | 'evidence'>,
): string {
  return [
    normalizeText(signal.detector),
    normalizeText(signal.type),
    normalizePath(signal.filePath),
    String(normalizeLine(signal.line)),
    normalizeText(signal.evidence),
  ].join('\u0000');
}

function mergeFinding(
  existing: PulseVerifiedFinding,
  incoming: PulseVerifiedFinding,
): PulseVerifiedFinding {
  const evidenceChain = [...existing.evidenceChain, ...incoming.evidenceChain];
  const truthMode = strongestTruthMode(evidenceChain);
  const actionability = strongestActionability([existing.actionability, incoming.actionability]);
  const falsePositiveRisk = lowestFalsePositiveRisk([
    existing.falsePositiveRisk,
    incoming.falsePositiveRisk,
    defaultFalsePositiveRisk(truthMode),
  ]);

  return {
    ...existing,
    truthMode,
    actionability:
      truthMode === 'weak_signal' && actionability === 'fix_now' ? 'needs_probe' : actionability,
    falsePositiveRisk,
    blocking: truthMode !== 'weak_signal' && (existing.blocking || incoming.blocking),
    evidenceChain,
  };
}

export function verifyPulseRawSignal(signal: PulseRawSignal): PulseVerifiedFinding {
  const truthMode = classifyTruthMode(signal);
  const falsePositiveRisk = highestFalsePositiveRisk([
    defaultFalsePositiveRisk(truthMode),
    signal.falsePositiveRisk ?? defaultFalsePositiveRisk(truthMode),
  ]);
  const actionability = classifyActionability(signal, truthMode);

  return {
    detector: normalizeText(signal.detector),
    type: normalizeText(signal.type),
    filePath: normalizePath(signal.filePath),
    line: normalizeLine(signal.line),
    evidence: normalizeText(signal.evidence),
    truthMode,
    actionability,
    falsePositiveRisk,
    blocking: canBlock(signal, truthMode),
    evidenceChain: [evidenceChainItem(signal, truthMode)],
  };
}

export function groupVerifiedFindings(signals: readonly PulseRawSignal[]): PulseVerifiedFinding[] {
  const grouped = new Map<string, PulseVerifiedFinding>();

  for (const signal of signals) {
    const key = dedupeKey(signal);
    const finding = verifyPulseRawSignal(signal);
    const existing = grouped.get(key);
    grouped.set(key, existing ? mergeFinding(existing, finding) : finding);
  }

  return [...grouped.values()].sort((left, right) => {
    const fileCompare = left.filePath.localeCompare(right.filePath);
    if (fileCompare !== 0) {
      return fileCompare;
    }
    return (left.line ?? 0) - (right.line ?? 0);
  });
}
