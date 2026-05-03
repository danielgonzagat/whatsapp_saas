// ─── External Signal Parsing & Loading ──────────────────────────────────────

import * as p from 'path';
import { EXTERNAL_SIGNAL_STATE_FILE, DYNAMIC_SIGNAL_SEMANTICS_NOTE } from './constants';
import {
  bound01,
  neutralMagnitude,
  defaultCertainty,
  positiveSignal,
  trendSignal,
  observedInfluence,
} from './math-helpers';
import { unique } from '../../signal-normalizers';
import {
  safeJsonParseFile,
  asString,
  asOptionalNumber,
  asStringArray,
  isRecord,
  isSignalSource,
  isSkippedAdapterState,
  asArray,
  asNumber,
} from './json-parsing';
import type {
  CanonicalExternalSignal,
  CanonicalExternalAdapter,
  CanonicalExternalSignalState,
} from './json-parsing';
import {
  mapSeverity,
  deriveAction,
  deriveOperationalEvidenceKind,
  deriveSignalType,
} from './signal-semantics';
import type {
  RuntimeSignal,
  RuntimeFusionState,
  RuntimeFusionEvidenceStatus,
} from '../../types.runtime-fusion';
import { pathExists as existsAt } from '../../safe-fs';

function parseTrend(value: unknown): RuntimeSignal['trend'] {
  if (value === 'worsening' || value === 'stable' || value === 'improving') return value;
  return 'unknown';
}

function parseObservedPayload(value: Record<string, unknown>): Record<string, unknown> {
  let observedPayload = value.observedPayload ?? value.payload ?? value.metrics ?? {};
  return isRecord(observedPayload) ? observedPayload : {};
}

export function observedInfluence(signal: CanonicalExternalSignal): number {
  return bound01(signal.impactScore / Math.max(signal.impactScore, signal.severity, 1));
}

export function parseCanonicalExternalSignal(value: unknown): CanonicalExternalSignal | null {
  if (!isRecord(value)) return null;
  let sourceRaw = asString(value.source);
  if (!isSignalSource(sourceRaw) || sourceRaw === 'otel_runtime') return null;

  let truthModeRaw = asString(value.truthMode);
  let truthMode: CanonicalExternalSignal['truthMode'] =
    truthModeRaw === 'inferred' ? 'inferred' : 'observed';
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

export function parseCanonicalExternalAdapter(value: unknown): CanonicalExternalAdapter | null {
  if (!isRecord(value)) return null;
  let source = asString(value.source);
  let status = asString(value.status);
  if (!source || !status) return null;
  return { source, status };
}

export function parseCanonicalExternalSignalState(
  payload: Record<string, unknown>,
): CanonicalExternalSignalState {
  let truthModeRaw = asString(payload.truthMode);
  let truthMode: CanonicalExternalSignalState['truthMode'] =
    truthModeRaw === 'inferred' ? 'inferred' : 'observed';
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

export function canonicalExternalSignalToRuntimeSignal(
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
        status: existsAt(artifactPath) ? 'invalid' : 'not_available',
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
    if (adapter.status === 'not_available') notAvailableAdapters.push(adapter.source);
    if (adapter.status === 'stale') staleAdapters.push(adapter.source);
    if (adapter.status === 'invalid') invalidAdapters.push(adapter.source);
    if (isSkippedAdapterState(adapter.status)) skippedAdapters.push(adapter.source);
  }

  let observedSignals = state.signals.filter((signal) => signal.truthMode === 'observed').length;
  let inferredSignals = state.signals.length - observedSignals;
  let status: RuntimeFusionEvidenceStatus = 'not_available';
  if (state.signals.length > 0) {
    status = state.truthMode;
  } else if (invalidAdapters.length > 0 || notAvailableAdapters.length > 0) {
    status = 'not_available';
  } else if (staleAdapters.length > 0) {
    status = 'inferred';
  } else if (skippedAdapters.length > 0) {
    status = 'skipped';
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
