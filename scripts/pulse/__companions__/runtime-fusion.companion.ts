function isSignalSource(value: string): value is SignalSource {
  switch (value) {
    case 'github':
    case 'sentry':
    case 'datadog':
    case 'prometheus':
    case 'github_actions':
    case 'codacy':
    case 'codecov':
    case 'dependabot':
    case 'gitnexus':
    case 'otel_runtime':
      return true;
    default:
      return false;
  }
}

function isSkippedAdapterState(value: string): boolean {
  let words = new Set(tokenizeEvidenceTerm(value));
  return words.has('skipped') || (words.has('optional') && words.has('configured'));
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
  return {
    github: 0,
    sentry: 0,
    datadog: 0,
    prometheus: 0,
    github_actions: 0,
    codacy: 0,
    codecov: 0,
    dependabot: 0,
    gitnexus: 0,
    otel_runtime: 0,
  };
}

interface CanonicalExternalSignal {
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

interface CanonicalExternalAdapter {
  source: string;
  status: string;
}

interface CanonicalExternalSignalState {
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

function parseTrend(value: unknown): RuntimeSignal['trend'] {
  if (value === 'worsening' || value === 'stable' || value === 'improving') return value;
  return 'unknown';
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

function loadCanonicalExternalSignals(currentDir: string): {
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

// ─── OTel Runtime Signal Extraction ───────────────────────────────────────────

/**
 * Convert an OpenTelemetry error span into a {@link RuntimeSignal}.
 *
 * Each error span (status === 'error') from PULSE_OTEL_RUNTIME.json becomes
 * a runtime error signal with file path and service context so it can be
 * mapped to capabilities.
 */
function otelErrorSpanToSignal(
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
function otelLatencyToSignal(
  endpoint: string,
  avgMs: number,
  p95Ms: number,
  traceTotal: number,
): RuntimeSignal {
  let id = `otel:latency:${endpoint.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60)}`;
  let level: SignalSeverity = mapSeverity(
    bound01(p95Ms / observedLatencyDenominator(p95Ms, avgMs, traceTotal)),
  );

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
 *
 * Extracts:
 *  - Error spans as runtime error signals
 *  - Trace endpoint latency as latency signals (for endpoints exceeding thresholds)
 *  - Span-to-path mappings to connect signals to capabilities
 *
 * @param evidence - The already loaded runtime trace artifact.
 * @returns Array of {@link RuntimeSignal} entries.
 */
function runtimeTraceEvidenceToSignals(evidence: RuntimeCallGraphEvidence): RuntimeSignal[] {
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

// ─── File Loading ───────────────────────────────────────────────────────────

function loadRuntimeTraceEvidence(currentDir: string): {
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

function truthModeFromEvidenceStatus(
  status: RuntimeFusionEvidenceStatus,
): RuntimeFusionMachineImprovementSignal['truthMode'] {
  if (status === 'observed') return 'observed';
  if (status === 'inferred' || status === 'simulated' || status === 'skipped') return 'inferred';
  return 'not_available';
}

function buildMachineImprovementSignals(
  externalEvidence: RuntimeFusionState['evidence']['externalSignalState'],
  traceEvidence: RuntimeFusionState['evidence']['runtimeTraces'],
): RuntimeFusionMachineImprovementSignal[] {
  let signals: RuntimeFusionMachineImprovementSignal[] = [];

  if (
    externalEvidence.status === 'not_available' ||
    externalEvidence.status === 'invalid' ||
    externalEvidence.notAvailableAdapters.length > 0 ||
    externalEvidence.staleAdapters.length > 0 ||
    externalEvidence.invalidAdapters.length > 0
  ) {
    signals.push({
      id: 'runtime-fusion:external-signal-evidence',
      targetEngine: 'external-sources-orchestrator',
      missingEvidence: 'external_signal',
      truthMode: truthModeFromEvidenceStatus(externalEvidence.status),
      sourceStatus: externalEvidence.status,
      artifactPath: externalEvidence.artifactPath,
      reason: externalEvidence.reason,
      recommendedPulseAction:
        'Improve PULSE external adapter execution and freshness reporting so missing runtime signals become observed or explicitly not_available.',
      productEditRequired: false,
    });
  }

  let adapterGaps = [
    ...externalEvidence.notAvailableAdapters.map((adapterName) => ({
      adapterName,
      status: 'not_available',
    })),
    ...externalEvidence.staleAdapters.map((adapterName) => ({ adapterName, status: 'stale' })),
    ...externalEvidence.invalidAdapters.map((adapterName) => ({ adapterName, status: 'invalid' })),
  ];

  for (let { adapterName, status } of adapterGaps) {
    signals.push({
      id: `runtime-fusion:adapter:${adapterName}`,
      targetEngine: 'external-sources-orchestrator',
      missingEvidence: 'adapter_status',
      truthMode: 'not_available',
      sourceStatus: status,
      artifactPath: externalEvidence.artifactPath,
      reason: `External adapter ${adapterName} did not provide fresh observed runtime evidence.`,
      recommendedPulseAction:
        'Improve the PULSE adapter status resolver and evidence capture path for this source; do not convert the gap into a product-code task.',
      productEditRequired: false,
    });
  }

  if (
    traceEvidence.status === 'not_available' ||
    traceEvidence.status === 'invalid' ||
    traceEvidence.status === 'skipped' ||
    traceEvidence.status === 'simulated'
  ) {
    signals.push({
      id: 'runtime-fusion:runtime-traces',
      targetEngine: 'otel-runtime',
      missingEvidence: 'runtime_trace',
      truthMode: truthModeFromEvidenceStatus(traceEvidence.status),
      sourceStatus: traceEvidence.status,
      artifactPath: traceEvidence.artifactPath,
      reason: traceEvidence.reason,
      recommendedPulseAction:
        'Improve PULSE runtime trace collection or preserved observed-trace loading before treating runtime proof as complete.',
      productEditRequired: false,
    });
  }

  return signals;
}

// ─── Mapping Signals to Capabilities ────────────────────────────────────────

/**
 * Map a runtime signal to capability IDs using file path matching and
 * message pattern matching against capability names.
 *
 * @param signal - The runtime signal to map.
 * @param capabilityState - Optional capability state for name matching.
 * @returns Array of matched capability IDs.
 */
export function mapSignalToCapabilities(
  signal: RuntimeSignal,
  capabilityState?: { capabilities?: Array<{ id: string; name: string; filePaths?: string[] }> },
): string[] {
  let ids = new Set(signal.affectedCapabilityIds);

  if (capabilityState?.capabilities) {
    let messageTokens = new Set(tokenize(signal.message));
    let hasObservedFileHints = signal.affectedFilePaths.length > 0;

    for (let capability of capabilityState.capabilities) {
      let nameTokens = tokenize(capability.name);

      let hasNameMatch = nameTokens.some((nt) => nt.length >= 3 && messageTokens.has(nt));

      let hasFilePathMatch = signal.affectedFilePaths.some((signalFile) => {
        let normalizedSignalFile = normalizePathSeparators(signalFile);
        return (capability.filePaths ?? []).some((capFile) => {
          let normalizedCapabilityFile = normalizePathSeparators(capFile);
          return (
            normalizedCapabilityFile.includes(normalizedSignalFile) ||
            normalizedSignalFile.includes(normalizedCapabilityFile)
          );
        });
      });

      if (hasFilePathMatch || (!hasObservedFileHints && hasNameMatch)) {
        ids.add(capability.id);
      }
    }
  }

  return Array.from(ids);
}

export function mapSignalToFlows(
  signal: RuntimeSignal,
  flowProjection?: {
    flows?: Array<{
      id: string;
      name: string;
      capabilityIds?: string[];
      routePatterns?: string[];
    }>;
  },
): string[] {
  let ids = new Set(signal.affectedFlowIds);
  if (!flowProjection?.flows) return Array.from(ids);

  let messageTokens = new Set(tokenize(signal.message));
  for (let flow of flowProjection.flows) {
    let capabilityMatch = (flow.capabilityIds ?? []).some((capabilityId) =>
      signal.affectedCapabilityIds.includes(capabilityId),
    );
    let routeMatch = (flow.routePatterns ?? []).some((routePattern) =>
      signal.message.includes(routePattern),
    );
    let nameMatch = tokenize(flow.name).some(
      (token) => token.length >= 4 && messageTokens.has(token),
    );
    if (capabilityMatch || routeMatch || nameMatch) {
      ids.add(flow.id);
    }
  }

  return Array.from(ids);
}

function mapCapabilitiesFromFlows(
  signal: RuntimeSignal,
  flowProjection?: {
    flows?: Array<{ id: string; capabilityIds?: string[] }>;
  },
): string[] {
  if (!flowProjection?.flows) return [];
  return unique(
    flowProjection.flows
      .filter((flow) => signal.affectedFlowIds.includes(flow.id))
      .flatMap((flow) => flow.capabilityIds ?? []),
  );
}

// ─── Impact Score Computation ───────────────────────────────────────────────

/**
 * Compute an impact score (0..1) for a runtime signal based on observed load,
 * users, trend, and action semantics. Severity only contributes ordinal
 * pressure; it is not a fixed authority table.
 *
 * @param signal - The runtime signal to score.
 * @returns Impact score in the range 0..1.
 */
export function computeImpactScore(signal: RuntimeSignal): number {
  return deriveMagnitude(signal);
}

function deriveMagnitude(signal: RuntimeSignal): number {
  let levels: SignalSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
  let ordinal = levels.indexOf(signal.severity);
  let ordinalForce = ordinal >= 0 ? (ordinal + 1) / levels.length : signal.impactScore;
  let freqLog = Math.log10(Math.max(signal.frequency, 1) + 1);
  let userLog = Math.log10(Math.max(signal.affectedUsers, 1) + 1);
  let trendForce = signal.trend === 'worsening' ? 0.2 : signal.trend === 'improving' ? -0.1 : 0;
  let actionForce =
    signal.action === 'block_deploy' ? 0.25 : signal.action === 'block_merge' ? 0.15 : 0;

  let observedMagnitude = (freqLog + userLog) / Math.max(freqLog + userLog, 12);
  let raw = observedMagnitude + ordinalForce * 0.2 + trendForce + actionForce;

  return bound01(raw);
}

// ─── Priority Overrides ─────────────────────────────────────────────────────

/**
 * Override static analysis priorities based on runtime signal reality.
 *
 * Any capability that has active critical or high runtime signals is promoted
 * to P0 priority regardless of its static analysis priority.
 *
 * @param fusionState - The current runtime fusion state.
 * @param convergencePlan - Optional convergence plan with current priorities.
 * @returns The fusion state with priority overrides applied.
 */
export function overridePriorities(
  fusionState: RuntimeFusionState,
  convergencePlan?: {
    priorities?: Record<string, string>;
    units?: Array<{ capabilityId?: string; priority: string; name?: string }>;
  },
): RuntimeFusionState {
  let overrides = fusionState.priorityOverrides.slice();

  for (let capId of Object.keys(fusionState.summary.signalsByCapability)) {
    let capabilitySignals = fusionState.signals.filter(
      (s) => s.affectedCapabilityIds.includes(capId) && isDecisiveRuntimeRealitySignal(s),
    );
    if (capabilitySignals.length === 0) continue;

    let originalPriority = 'P2';
    if (convergencePlan) {
      if (convergencePlan.priorities?.[capId]) {
        originalPriority = convergencePlan.priorities[capId];
      } else if (convergencePlan.units) {
        let unit = convergencePlan.units.find((u) => u.capabilityId === capId || u.name === capId);
        if (unit) originalPriority = unit.priority;
      }
    }

    if (originalPriority === 'P0') continue;
    let dynamicPriority = rankByRuntimeReality(capabilitySignals, originalPriority);
    if ((ORDER_INDEX[dynamicPriority] ?? 2) >= (ORDER_INDEX[originalPriority] ?? 2)) continue;

    let uniqueSources = unique(capabilitySignals.map((s) => s.source));
    let impactFloor = observedMeanOrSelf(
      capabilitySignals.map((signal) => signal.impactScore),
      0,
    );
    let reasons = capabilitySignals
      .filter((s) => s.impactScore >= impactFloor || s.action === 'block_deploy')
      .map((s) => `[${s.severity}] ${s.message.slice(0, 100)}`)
      .slice(0, 3);

    overrides.push({
      capabilityId: capId,
      originalPriority,
      newPriority: dynamicPriority,
      reason: `Dynamic signal semantics promoted runtime priority from observed operational impact from ${uniqueSources.join(', ')}: ${reasons.join('; ')}`,
    });
  }

  return { ...fusionState, priorityOverrides: overrides };
}

// ─── Runtime Reality Ranking ────────────────────────────────────────────────

let ORDER_INDEX: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * Rank capabilities by runtime reality precedence.
 *
 * The rule is:
 * > "real error > lint, real latency > code smell,
 * >  deploy failure > refactor, test regression > new feature"
 *
 * Runtime signals are classified into tiers, and the resulting priority
 * is the max of the runtime-derived priority and the static priority.
 *
 * @param signals - Active runtime signals for a capability.
 * @param staticOrder - The current static priority (P0–P3).
 * @returns The final priority string.
 */
export function rankByRuntimeReality(signals: RuntimeSignal[], staticOrder: string): string {
  return deriveOrder(signals, staticOrder);
}

function deriveOrder(signals: RuntimeSignal[], staticOrder: string): string {
  if (signals.length === 0) return staticOrder;

  let activeSignals = signals.filter(
    (s) => (!s.pinned || s.severity !== 'info') && isDecisiveRuntimeRealitySignal(s),
  );
  if (activeSignals.length === 0) return staticOrder;

  let impactValues = activeSignals.map((signal) =>
    Math.max(bound01(signal.impactScore), computeImpactScore(signal), runtimeRealityFactor(signal)),
  );
  let strongestImpact = Math.max(...impactValues);
  let dynamicFloor = observedMeanOrSelf(impactValues, strongestImpact);
  let dynamicSpread = observedSpread(impactValues);
  let deployBlockingMass = activeSignals
    .filter((signal) => signal.action === 'block_deploy')
    .map((signal) => signal.impactScore);
  let mergeBlockingMass = activeSignals
    .filter((signal) => signal.action === 'block_merge')
    .map((signal) => signal.impactScore);

  let runtimeOrder = staticOrder;
  if (
    strongestImpact >= dynamicFloor + dynamicSpread ||
    average(deployBlockingMass) >= dynamicFloor
  ) {
    runtimeOrder = 'P0';
  } else if (strongestImpact >= dynamicFloor || average(mergeBlockingMass) >= dynamicFloor) {
    runtimeOrder = 'P1';
  } else if (strongestImpact > 0) {
    runtimeOrder = 'P2';
  }

  let runtimeOrdinal = ORDER_INDEX[runtimeOrder] ?? 2;
  let staticOrdinal = ORDER_INDEX[staticOrder] ?? 2;

  return runtimeOrdinal <= staticOrdinal ? runtimeOrder : staticOrder;
}

// ─── Summary Generation ─────────────────────────────────────────────────────

function buildSummary(
  signals: RuntimeSignal[],
  capabilityState?: { capabilities?: Array<{ id: string }> },
): RuntimeFusionState['summary'] {
  let totalSignals = signals.length;
  let criticalSignals = signals.filter(isCriticalSignal).length;
  let highSignals = signals.filter(isHighSignal).length;
  let blockMergeSignals = signals.filter(
    (s) => s.action === 'block_merge' || s.action === 'block_deploy',
  ).length;
  let blockDeploySignals = signals.filter((s) => s.action === 'block_deploy').length;

  let sourceCounts = emptySourceCounts();
  for (let s of signals) {
    sourceCounts[s.source] = (sourceCounts[s.source] ?? 0) + 1;
  }

  let signalsByCapability: Record<string, number> = {};
  let signalsByFlow: Record<string, number> = {};
  let capImpactAccum: Record<string, number> = {};
  let flowImpactAccum: Record<string, number> = {};

  for (let s of signals) {
    for (let capId of s.affectedCapabilityIds) {
      signalsByCapability[capId] = (signalsByCapability[capId] ?? 0) + 1;
      capImpactAccum[capId] = (capImpactAccum[capId] ?? 0) + s.impactScore;
    }
    for (let flowId of s.affectedFlowIds) {
      signalsByFlow[flowId] = (signalsByFlow[flowId] ?? 0) + 1;
      flowImpactAccum[flowId] = (flowImpactAccum[flowId] ?? 0) + s.impactScore;
    }
  }

  let topImpactCapabilities = Object.entries(capImpactAccum)
    .sort(([, a], [, b]) => b - a)
    .slice(0, observedExtent(capImpactAccum))
    .map(([capabilityId, impactScore]) => ({ capabilityId, impactScore }));

  let topImpactFlows = Object.entries(flowImpactAccum)
    .sort(([, a], [, b]) => b - a)
    .slice(0, observedExtent(flowImpactAccum))
    .map(([flowId, impactScore]) => ({ flowId, impactScore }));

  return {
    totalSignals,
    criticalSignals,
    highSignals,
    blockMergeSignals,
    blockDeploySignals,
    sourceCounts,
    signalsByCapability,
    signalsByFlow,
    topImpactCapabilities,
    topImpactFlows,
  };
}

function observedExtent(values: Record<string, number>): number {
  let size = Object.keys(values).length;
  let nonEmptySize = Math.max(Math.sign(size), size);
  return Math.max(
    Math.sign(nonEmptySize),
    Math.ceil(Math.sqrt(nonEmptySize)) + Math.ceil(Math.log2(nonEmptySize)),
  );
}

// ─── Main Builder ───────────────────────────────────────────────────────────

/**
 * Build the full Runtime Reality Fusion state from all available external signal sources.
 *
 * This function:
 * 1. Loads external signals from each source file in `.pulse/current/`
 * 2. Normalizes them into {@link RuntimeSignal} objects
 * 3. Maps signals to capabilities using file paths and message patterns
 * 4. Computes per-signal impact scores
 * 5. Generates a summary with counts, breakdowns, and top-impact rankings
 * 6. Generates priority overrides for capabilities with critical/high runtime signals
 * 7. Saves the result to `.pulse/current/PULSE_RUNTIME_FUSION.json`
 *
 * @param rootDir - The root directory of the PULSE state (typically `.pulse/current`).
 * @returns The complete {@link RuntimeFusionState}.
 */
export function buildRuntimeFusionState(rootDir: string): RuntimeFusionState {
  let currentDir = resolvePulseCurrentDir(rootDir);
  let externalSignals = loadCanonicalExternalSignals(currentDir);
  let runtimeTraces = loadRuntimeTraceEvidence(currentDir);
  let allSignals: RuntimeSignal[] = [...externalSignals.signals, ...runtimeTraces.signals];

  // Try loading capability state for signal→capability mapping context
  let capabilityStatePath = p.join(currentDir, 'PULSE_CAPABILITY_STATE.json');
  let capabilityPayload = safeJsonParseFile(capabilityStatePath);
  let capabilityState = capabilityPayload
    ? (capabilityPayload as unknown as {
        capabilities?: Array<{ id: string; name: string; filePaths?: string[] }>;
      })
    : undefined;
  let flowProjectionPath = p.join(currentDir, 'PULSE_FLOW_PROJECTION.json');
  let flowProjectionPayload = safeJsonParseFile(flowProjectionPath);
  let flowProjection = flowProjectionPayload
    ? (flowProjectionPayload as unknown as {
        flows?: Array<{
          id: string;
          name: string;
          capabilityIds?: string[];
          routePatterns?: string[];
        }>;
      })
    : undefined;

  // Map signals to capabilities where not already mapped
  for (let signal of allSignals) {
    let mapped = mapSignalToCapabilities(signal, capabilityState);
    signal.affectedCapabilityIds = unique([...signal.affectedCapabilityIds, ...mapped]);
    let mappedFlows = mapSignalToFlows(signal, flowProjection);
    signal.affectedFlowIds = unique([...signal.affectedFlowIds, ...mappedFlows]);
    signal.affectedCapabilityIds = unique([
      ...signal.affectedCapabilityIds,
      ...mapCapabilitiesFromFlows(signal, flowProjection),
    ]);
    // Recompute impact score using the fusion formula
    signal.impactScore = normalizeImpactByRuntimeReality(
      signal,
      Math.max(bound01(signal.impactScore), computeImpactScore(signal)),
      allSignals,
    );
    signal.confidence = bound01(signal.confidence);
    syncAffectedAliases(signal);
  }

  // Load convergence plan for priority context
  let convergencePlanPath = p.join(currentDir, 'PULSE_CONVERGENCE_PLAN.json');
  let convergencePayload = safeJsonParseFile(convergencePlanPath);
  let convergencePlan = convergencePayload
    ? (convergencePayload as unknown as {
        priorities?: Record<string, string>;
        units?: Array<{ capabilityId?: string; priority: string; name?: string }>;
      })
    : undefined;

  let summary = buildSummary(allSignals, capabilityState);

  let state: RuntimeFusionState = {
    generatedAt: new Date().toISOString(),
    signals: allSignals,
    summary,
    evidence: {
      externalSignalState: externalSignals.evidence,
      runtimeTraces: runtimeTraces.evidence,
    },
    priorityOverrides: [],
    machineImprovementSignals: buildMachineImprovementSignals(
      externalSignals.evidence,
      runtimeTraces.evidence,
    ),
  };

  state = overridePriorities(state, convergencePlan);

  if (!existsAt(currentDir)) {
    ensureDir(currentDir, { recursive: true });
  }
  writeTextFile(p.join(currentDir, FUSION_OUTPUT_FILE), JSON.stringify(state, null, 2));

  return state;
}

