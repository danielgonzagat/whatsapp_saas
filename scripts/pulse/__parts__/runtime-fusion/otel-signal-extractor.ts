// ─── OTel Runtime Signal Extraction ───────────────────────────────────────────

import * as p from 'path';
import { pathExists as existsAt } from '../../safe-fs';
import { RUNTIME_TRACES_FILE } from './constants';
import {
  bound01,
  observedHttpDenominator,
  observedLatencyDenominator,
  observedOccurrence,
  observedMeanOrSelf,
  observedSpread,
} from './math-helpers';
import {
  safeJsonParseFile,
  asString,
  asArray,
  asNumber,
  isRecord,
  isRuntimeCallGraphEvidence,
  traceSourceLooksObserved,
} from './json-parsing';
import { unique } from '../../signal-normalizers';
import { mapSeverity, deriveAction } from './signal-semantics';
import type { OtelSpan, RuntimeCallGraphEvidence } from '../../types.otel-runtime';
import type { RuntimeSignal, RuntimeFusionState } from '../../types.runtime-fusion';

/**
 * Convert an OpenTelemetry error span into a {@link RuntimeSignal}.
 *
 * Each error span (status === 'error') from PULSE_OTEL_RUNTIME.json becomes
 * a runtime error signal with file path and service context so it can be
 * mapped to capabilities.
 */
export function otelErrorSpanToSignal(
  span: OtelSpan,
  traceId: string,
  mappedFilePaths: string[],
): RuntimeSignal {
  let httpMethod = (span.attributes['http.method'] as string) || '';
  let httpRoute = (span.attributes['http.route'] as string) || '';
  let httpStatus = (span.attributes['http.status_code'] as number) || 0;
  let structuralFrom = (span.attributes['pulse.structural.from'] as string) || '';
  let structuralTo = (span.attributes['pulse.structural.to'] as string) || '';

  let requestDesc = httpMethod && httpRoute ? `${httpMethod} ${httpRoute}` : span.name;
  let statusMsg = span.statusMessage || `${requestDesc} returned status ${httpStatus || 'error'}`;

  let message = `[OTel] ${span.serviceName}: ${statusMsg}`;
  let affectedFilePaths = unique([
    ...mappedFilePaths,
    ...[structuralFrom, structuralTo].filter(
      (value) => value.includes('/') || value.includes('\\'),
    ),
  ]);

  let id = `otel:error:${span.spanId}:${span.serviceName}:${span.name.slice(0, 60)}`;
  let level = mapSeverity(bound01(httpStatus / Math.max(httpStatus, 500)));

  return {
    id,
    source: 'otel_runtime',
    type: 'error',
    severity: level,
    action: deriveAction(level, 'error'),
    message,
    affectedCapabilityIds: [],
    affectedFlowIds: [],
    affectedFilePaths,
    frequency: 1,
    affectedUsers: 0,
    impactScore: bound01(httpStatus / observedHttpDenominator(httpStatus)),
    confidence: bound01(httpStatus / observedHttpDenominator(httpStatus)),
    evidenceKind: 'runtime',
    firstSeen: span.startTime,
    lastSeen: span.endTime,
    count: observedOccurrence(httpStatus),
    trend: 'unknown',
    pinned: false,
    evidenceMode: 'observed',
    sourceArtifact: RUNTIME_TRACES_FILE,
  };
}

/**
 * Convert an OpenTelemetry trace summary latency marker into a {@link RuntimeSignal}.
 */
export function otelLatencyToSignal(
  endpoint: string,
  avgMs: number,
  p95Ms: number,
  traceTotal: number,
): RuntimeSignal {
  let id = `otel:latency:${endpoint.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60)}`;
  let level = mapSeverity(bound01(p95Ms / observedLatencyDenominator(p95Ms, avgMs, traceTotal)));

  return {
    id,
    source: 'otel_runtime',
    type: 'latency',
    severity: level,
    action: level === 'high' ? 'prioritize_fix' : 'log_only',
    message: `[OTel] ${endpoint}: avg=${avgMs}ms, p95=${p95Ms}ms across ${traceTotal} traces`,
    affectedCapabilityIds: [],
    affectedFlowIds: [],
    affectedFilePaths: [],
    frequency: traceTotal,
    affectedUsers: 0,
    impactScore: bound01(p95Ms / observedLatencyDenominator(p95Ms, avgMs, traceTotal)),
    confidence: bound01(traceTotal / (traceTotal + observedOccurrence(traceTotal))),
    evidenceKind: 'runtime',
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    count: traceTotal,
    trend: 'unknown',
    pinned: false,
    evidenceMode: 'observed',
    sourceArtifact: RUNTIME_TRACES_FILE,
  };
}

/**
 * Convert observed OpenTelemetry runtime evidence from PULSE_RUNTIME_TRACES.json
 * into {@link RuntimeSignal} entries for fusion.
 */
export function runtimeTraceEvidenceToSignals(evidence: RuntimeCallGraphEvidence): RuntimeSignal[] {
  let signals: RuntimeSignal[] = [];
  let mappedPathsBySpanName = new Map<string, string[]>();
  let endpointCounts = Object.values(evidence.summary.endpointMap);
  let activeEndpointFloor = observedMeanOrSelf(endpointCounts, 0);
  let durationSignals = [evidence.summary.avgDurationMs, evidence.summary.p95DurationMs].filter(
    (value) => value > 0,
  );
  let durationFloor = observedMeanOrSelf(durationSignals, 0) + observedSpread(durationSignals);

  for (let mapping of evidence.spanToPathMappings) {
    if (mapping.confidence < 0.5 || mapping.matchedFilePaths.length === 0) continue;
    mappedPathsBySpanName.set(
      mapping.spanName,
      unique([...(mappedPathsBySpanName.get(mapping.spanName) ?? []), ...mapping.matchedFilePaths]),
    );
  }

  for (let trace of evidence.traces) {
    for (let span of trace.spans) {
      if (span.status === 'error') {
        signals.push(
          otelErrorSpanToSignal(span, trace.traceId, mappedPathsBySpanName.get(span.name) ?? []),
        );
      }
    }
  }

  for (let [endpoint, count] of Object.entries(evidence.summary.endpointMap)) {
    if (count < activeEndpointFloor) continue;
    let p95 = evidence.summary.p95DurationMs;
    let avg = evidence.summary.avgDurationMs;
    if (Math.max(p95, avg) >= durationFloor) {
      signals.push(otelLatencyToSignal(endpoint, avg, p95, count));
    }
  }

  for (let mapping of evidence.spanToPathMappings) {
    if (mapping.confidence < 0.5) continue;
    let filePaths = mapping.matchedFilePaths;
    if (filePaths.length === 0) continue;

    for (let signal of signals) {
      if (signal.source !== 'otel_runtime') continue;
      if (signal.message.includes(mapping.spanName)) {
        signal.affectedFilePaths = unique([...signal.affectedFilePaths, ...filePaths]);
      }
    }
  }

  return signals;
}

export function loadRuntimeTraceEvidence(currentDir: string): {
  signals: RuntimeSignal[];
  evidence: RuntimeFusionState['evidence']['runtimeTraces'];
} {
  let artifactPath = p.join(currentDir, RUNTIME_TRACES_FILE);
  let payload = safeJsonParseFile(artifactPath);
  if (!payload) {
    return {
      signals: [],
      evidence: {
        status: existsAt(artifactPath) ? 'invalid' : 'not_available',
        artifactPath,
        source: null,
        totalTraces: 0,
        totalSpans: 0,
        errorTraces: 0,
        derivedSignals: 0,
        reason: existsAt(artifactPath)
          ? `${RUNTIME_TRACES_FILE} is not valid JSON.`
          : `${RUNTIME_TRACES_FILE} is not available in .pulse/current.`,
      },
    };
  }

  let source = asString(payload.source);
  let sourceDetails = isRecord(payload.sourceDetails) ? payload.sourceDetails : {};
  let runtimeObserved = sourceDetails.runtimeObserved === true;
  let summary = isRecord(payload.summary) ? payload.summary : {};
  let totalTraces = asNumber(summary.totalTraces, asArray(payload.traces).length);
  let totalSpans = asNumber(summary.totalSpans, 0);
  let errorTraces = asNumber(summary.errorTraces, 0);

  if (source === 'simulated') {
    return {
      signals: [],
      evidence: {
        status: 'simulated',
        artifactPath,
        source,
        totalTraces,
        totalSpans,
        errorTraces,
        derivedSignals: 0,
        reason: `${RUNTIME_TRACES_FILE} source is simulated; traces are retained as non-observed metadata only.`,
      },
    };
  }

  if (!traceSourceLooksObserved(source, runtimeObserved)) {
    return {
      signals: [],
      evidence: {
        status: source ? 'skipped' : 'invalid',
        artifactPath,
        source: source || null,
        totalTraces,
        totalSpans,
        errorTraces,
        derivedSignals: 0,
        reason: source
          ? `${RUNTIME_TRACES_FILE} source ${source} is not an observed runtime source for fusion.`
          : `${RUNTIME_TRACES_FILE} does not declare a runtime source.`,
      },
    };
  }

  if (!isRuntimeCallGraphEvidence(payload)) {
    return {
      signals: [],
      evidence: {
        status: 'invalid',
        artifactPath,
        source,
        totalTraces,
        totalSpans,
        errorTraces,
        derivedSignals: 0,
        reason: `${RUNTIME_TRACES_FILE} source ${source} is missing required trace evidence fields.`,
      },
    };
  }

  if (totalTraces === 0 || totalSpans === 0) {
    return {
      signals: [],
      evidence: {
        status: 'not_available',
        artifactPath,
        source,
        totalTraces,
        totalSpans,
        errorTraces,
        derivedSignals: 0,
        reason: `${RUNTIME_TRACES_FILE} source ${source} declares observed runtime provenance but contains zero traces or spans.`,
      },
    };
  }

  let signals = runtimeTraceEvidenceToSignals(payload);

  return {
    signals,
    evidence: {
      status: 'observed',
      artifactPath,
      source,
      totalTraces,
      totalSpans,
      errorTraces,
      derivedSignals: signals.length,
      reason: `${signals.length} runtime signal(s) derived from observed ${source} traces.`,
    },
  };
}
