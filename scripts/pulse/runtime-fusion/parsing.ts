import * as p from 'path';
import { pathExists as existsAt, readTextFile } from '../../safe-fs';
import { tokenize, unique } from '../../signal-normalizers';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/type-contract-labels';
import { discoverSignalSourceLabels } from '../../dynamic-reality-kernel/type-contract-engines';
import type { RuntimeCallGraphEvidence } from '../../types.otel-runtime';
import type {
  RuntimeSignal,
  SignalSource,
  RuntimeFusionState,
  RuntimeFusionEvidenceStatus,
} from '../../types.runtime-fusion';
import {
  ADAPTER_STALE,
  DYNAMIC_SIGNAL_SEMANTICS_NOTE,
  EVIDENCE_INVALID,
  EVIDENCE_NOT_AVAILABLE,
  EVIDENCE_SIMULATED,
  EVIDENCE_SKIPPED,
  EXTERNAL_SIGNAL_STATE_FILE,
  TRUTH_INFERRED,
  TRUTH_OBSERVED,
  bound01,
  defaultCertainty,
  deriveAction,
  deriveOperationalEvidenceKind,
  deriveSignalType,
  mapSeverity,
  neutralMagnitude,
  observedInfluence,
  positiveSignal,
  tokenizeEvidenceTerm,
  trendSignal,
} from './helpers';

// ─── JSON Parsing ───────────────────────────────────────────────────────────

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    let value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeJsonParseFile(fsLoc: string): Record<string, unknown> | null {
  if (!existsAt(fsLoc)) return null;
  try {
    return safeJsonParse(readTextFile(fsLoc, 'utf8'));
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is string => typeof e === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolvePulseCurrentDir(rootDir: string): string {
  if (p.basename(rootDir) === 'current' && p.basename(p.dirname(rootDir)) === '.pulse') {
    return rootDir;
  }
  return p.join(rootDir, '.pulse', 'current');
}

function syncAffectedAliases(signal: RuntimeSignal): void {
  signal.affectedCapabilityIds = unique(signal.affectedCapabilityIds);
  signal.affectedFlowIds = unique(signal.affectedFlowIds);
  signal.affectedCapabilities = signal.affectedCapabilityIds;
  signal.affectedFlows = signal.affectedFlowIds;
}

function isSignalSource(value: string): value is SignalSource {
  return discoverSignalSourceLabels().has(value);
}

function isSkippedAdapterState(value: string): boolean {
  let words = new Set(tokenizeEvidenceTerm(value));
  return words.has(EVIDENCE_SKIPPED) || (words.has('optional') && words.has('configured'));
}

function traceSourceLooksObserved(source: string, runtimeObserved: boolean): boolean {
  if (runtimeObserved) return true;
  let words = new Set(tokenizeEvidenceTerm(source));
  return (
    words.has('real') ||
    words.has('manual') ||
    words.has('otel') ||
    words.has('collector') ||
    words.has('datadog') ||
    words.has('sentry') ||
    words.has('runtime')
  );
}

function emptySourceCounts(): Record<SignalSource, number> {
  let counts: Record<string, number> = {};
  for (let source of discoverSignalSourceLabels()) {
    counts[source] = 0;
  }
  return counts as Record<SignalSource, number>;
}

export interface CanonicalExternalSignal {
  id: string;
  source: SignalSource;
  type: string;
  truthMode: 'observed' | 'inferred';
  severity: number;
  impactScore: number;
  baselineValue: number;
  blastRadiusValue: number;
  summary: string;
  observedAt: string | null;
  relatedFiles: string[];
  capabilityIds: string[];
  flowIds: string[];
  confidence: number;
  frequency: number;
  affectedUsers: number;
  trend: RuntimeSignal['trend'];
  observedPayload: Record<string, unknown>;
}

export interface CanonicalExternalAdapter {
  source: string;
  status: string;
}

export interface CanonicalExternalSignalState {
  generatedAt: string;
  truthMode: 'observed' | 'inferred';
  signals: CanonicalExternalSignal[];
  adapters: CanonicalExternalAdapter[];
}

function parseCanonicalExternalSignal(value: unknown): CanonicalExternalSignal | null {
  if (!isRecord(value)) return null;
  let sourceRaw = asString(value.source);
  if (!isSignalSource(sourceRaw) || sourceRaw === 'otel_runtime') return null;

  let truthModeRaw = asString(value.truthMode);
  let truthMode: CanonicalExternalSignal['truthMode'] = (
    truthModeRaw === TRUTH_INFERRED ? TRUTH_INFERRED : TRUTH_OBSERVED
  ) as CanonicalExternalSignal['truthMode'];
  let summary = asString(value.summary ?? value.message ?? value.title);
  let explicitSeverity = asOptionalNumber(value.severity);
  let explicitImpact = asOptionalNumber(value['impactScore']);
  let baselineValue = bound01(
    asNumber(value['runtimeBaselineScore'] ?? value.baselineScore ?? value.baselineDelta, 0),
  );
  let blastRadiusValue = bound01(
    asNumber(value['blastRadiusScore'] ?? value.blastRadius ?? value.blastRadiusImpact, 0),
  );

  return {
    id: asString(value.id) || `${sourceRaw}:${summary.slice(0, 80) || 'signal'}`,
    source: sourceRaw,
    type: asString(value.type) || 'external',
    truthMode,
    severity: neutralMagnitude(explicitSeverity, explicitImpact),
    impactScore: neutralMagnitude(explicitImpact, explicitSeverity),
    baselineValue,
    blastRadiusValue,
    summary: summary || `${sourceRaw} external signal`,
    observedAt: asString(value.observedAt) || null,
    relatedFiles: asStringArray(value.relatedFiles),
    capabilityIds: unique([
      ...asStringArray(value.capabilityIds),
      ...asStringArray(value.affectedCapabilityIds),
      ...asStringArray(value.affectedCapabilities),
    ]),
    flowIds: unique([
      ...asStringArray(value.flowIds),
      ...asStringArray(value.affectedFlowIds),
      ...asStringArray(value.affectedFlows),
    ]),
    confidence: defaultCertainty(value.confidence),
    frequency: Math.max(1, asNumber(value.frequency ?? value.count, 1)),
    affectedUsers: Math.max(0, asNumber(value.affectedUsers ?? value.userCount, 0)),
    trend: parseTrend(value.trend),
    observedPayload: parseObservedPayload(value),
  };
}

let TREND_LABELS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.runtime-fusion.ts',
  'trend',
);
let UNKNOWN_TREND = [...TREND_LABELS].find((l) => l === 'unknown') || 'unknown';
let TREND_WORSENING = [...TREND_LABELS].find((l) => l === 'worsening')!;
let TREND_IMPROVING = [...TREND_LABELS].find((l) => l === 'improving')!;

function parseTrend(value: unknown): RuntimeSignal['trend'] {
  if (typeof value === 'string' && TREND_LABELS.has(value) && value !== UNKNOWN_TREND)
    return value as RuntimeSignal['trend'];
  return UNKNOWN_TREND as RuntimeSignal['trend'];
}

function parseObservedPayload(value: Record<string, unknown>): Record<string, unknown> {
  let observedPayload = value.observedPayload ?? value.payload ?? value.metrics ?? {};
  return isRecord(observedPayload) ? observedPayload : {};
}

function parseCanonicalExternalAdapter(value: unknown): CanonicalExternalAdapter | null {
  if (!isRecord(value)) return null;
  let source = asString(value.source);
  let status = asString(value.status);
  if (!source || !status) return null;
  return { source, status };
}

function parseCanonicalExternalSignalState(
  payload: Record<string, unknown>,
): CanonicalExternalSignalState {
  let truthModeRaw = asString(payload.truthMode);
  let truthMode: CanonicalExternalSignalState['truthMode'] = (
    truthModeRaw === TRUTH_INFERRED ? TRUTH_INFERRED : TRUTH_OBSERVED
  ) as CanonicalExternalSignalState['truthMode'];
  let signals = asArray(payload.signals)
    .map(parseCanonicalExternalSignal)
    .filter((signal): signal is CanonicalExternalSignal => signal !== null);
  let adapters = asArray(payload.adapters)
    .map(parseCanonicalExternalAdapter)
    .filter((adapter): adapter is CanonicalExternalAdapter => adapter !== null);

  return {
    generatedAt: asString(payload.generatedAt) || new Date().toISOString(),
    truthMode,
    signals,
    adapters,
  };
}

function isRuntimeCallGraphEvidence(value: unknown): value is RuntimeCallGraphEvidence {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.source === 'string' &&
    isRecord(value.summary) &&
    Array.isArray(value.traces) &&
    Array.isArray(value.spanToPathMappings)
  );
}

function canonicalExternalSignalToRuntimeSignal(
  signal: CanonicalExternalSignal,
  generatedAt: string,
): RuntimeSignal {
  let evidenceKind = deriveOperationalEvidenceKind(signal);
  let type = deriveSignalType(evidenceKind, signal);
  let semanticMeasure = bound01(
    Math.max(
      signal.severity,
      signal.impactScore * observedInfluence(signal),
      signal.baselineValue,
      signal.blastRadiusValue,
      trendSignal(signal.trend) * signal.impactScore,
    ),
  );
  let severity = mapSeverity(semanticMeasure);
  let observedAt = signal.observedAt || generatedAt;
  let affectedCapabilityIds = unique(signal.capabilityIds);
  let affectedFlowIds = unique(signal.flowIds);
  let impactMeasure = bound01(
    Math.max(
      signal.impactScore,
      signal.baselineValue,
      signal.blastRadiusValue,
      positiveSignal(signal.affectedUsers),
    ),
  );

  return {
    id: signal.id,
    source: signal.source,
    type,
    severity,
    action: deriveAction(severity, type),
    message: signal.summary,
    affectedCapabilityIds,
    affectedFlowIds,
    affectedFilePaths: signal.relatedFiles,
    frequency: signal.frequency,
    affectedUsers: signal.affectedUsers,
    impactScore: impactMeasure,
    confidence: signal.confidence,
    evidenceKind,
    firstSeen: observedAt,
    lastSeen: observedAt,
    count: signal.frequency,
    trend: signal.trend,
    pinned: false,
    evidenceMode: signal.truthMode,
    sourceArtifact: EXTERNAL_SIGNAL_STATE_FILE,
    observedAt: signal.observedAt,
    affectedCapabilities: affectedCapabilityIds,
    affectedFlows: affectedFlowIds,
  };
}

export function loadCanonicalExternalSignals(currentDir: string): {
  signals: RuntimeSignal[];
  evidence: RuntimeFusionState['evidence']['externalSignalState'];
} {
  let artifactPath = p.join(currentDir, EXTERNAL_SIGNAL_STATE_FILE);
  let payload = safeJsonParseFile(artifactPath);
  if (!payload) {
    return {
      signals: [],
      evidence: {
        status: (existsAt(artifactPath)
          ? EVIDENCE_INVALID
          : EVIDENCE_NOT_AVAILABLE) as RuntimeFusionEvidenceStatus,
        artifactPath,
        totalSignals: 0,
        observedSignals: 0,
        inferredSignals: 0,
        adapterStatusCounts: {},
        notAvailableAdapters: [],
        skippedAdapters: [],
        staleAdapters: [],
        invalidAdapters: [],
        reason: existsAt(artifactPath)
          ? `${EXTERNAL_SIGNAL_STATE_FILE} is not valid JSON.`
          : `${EXTERNAL_SIGNAL_STATE_FILE} is not available in .pulse/current.`,
      },
    };
  }

  let state = parseCanonicalExternalSignalState(payload);
  let signals = state.signals.map((signal) =>
    canonicalExternalSignalToRuntimeSignal(signal, state.generatedAt),
  );
  let adapterStatusCounts: Record<string, number> = {};
  let notAvailableAdapters: string[] = [];
  let skippedAdapters: string[] = [];
  let staleAdapters: string[] = [];
  let invalidAdapters: string[] = [];

  for (let adapter of state.adapters) {
    adapterStatusCounts[adapter.status] = (adapterStatusCounts[adapter.status] ?? 0) + 1;
    if (adapter.status === EVIDENCE_NOT_AVAILABLE) notAvailableAdapters.push(adapter.source);
    if (adapter.status === ADAPTER_STALE) staleAdapters.push(adapter.source);
    if (adapter.status === EVIDENCE_INVALID) invalidAdapters.push(adapter.source);
    if (isSkippedAdapterState(adapter.status)) skippedAdapters.push(adapter.source);
  }

  let observedSignals = state.signals.filter(
    (signal) => signal.truthMode === TRUTH_OBSERVED,
  ).length;
  let inferredSignals = state.signals.length - observedSignals;
  let status: RuntimeFusionEvidenceStatus = EVIDENCE_NOT_AVAILABLE;
  if (state.signals.length > 0) {
    status = state.truthMode as RuntimeFusionEvidenceStatus;
  } else if (invalidAdapters.length > 0 || notAvailableAdapters.length > 0) {
    status = EVIDENCE_NOT_AVAILABLE as RuntimeFusionEvidenceStatus;
  } else if (staleAdapters.length > 0) {
    status = TRUTH_INFERRED as RuntimeFusionEvidenceStatus;
  } else if (skippedAdapters.length > 0) {
    status = EVIDENCE_SKIPPED as RuntimeFusionEvidenceStatus;
  }

  return {
    signals,
    evidence: {
      status,
      artifactPath,
      totalSignals: state.signals.length,
      observedSignals,
      inferredSignals,
      adapterStatusCounts,
      notAvailableAdapters,
      skippedAdapters,
      staleAdapters,
      invalidAdapters,
      reason:
        state.signals.length > 0
          ? `${state.signals.length} canonical external signal(s) loaded from ${EXTERNAL_SIGNAL_STATE_FILE}. ${DYNAMIC_SIGNAL_SEMANTICS_NOTE}`
          : `No canonical external signals were present in ${EXTERNAL_SIGNAL_STATE_FILE}. ${DYNAMIC_SIGNAL_SEMANTICS_NOTE}`,
    },
  };
}

export {
  TREND_IMPROVING,
  TREND_LABELS,
  TREND_WORSENING,
  UNKNOWN_TREND,
  asArray,
  asNumber,
  asString,
  emptySourceCounts,
  isRecord,
  isRuntimeCallGraphEvidence,
  resolvePulseCurrentDir,
  safeJsonParseFile,
  syncAffectedAliases,
  traceSourceLooksObserved,
};
