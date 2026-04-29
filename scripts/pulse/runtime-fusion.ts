/**
 * PULSE Runtime Reality Fusion Engine
 *
 * Fuses signals from observability platforms (Sentry, Datadog, Prometheus),
 * CI/CD (GitHub Actions), code quality (Codecov), and knowledge graph (GitNexus)
 * into a unified runtime reality that can override static analysis priorities.
 *
 * Core rule: "real error > lint, real latency > code smell,
 *              deploy failure > refactor, test regression > new feature"
 */

import * as path from 'path';
import { pathExists, readTextFile, writeTextFile, ensureDir } from './safe-fs';
import { tokenize, unique } from './signal-normalizers';
import type { RuntimeCallGraphEvidence, OtelSpan } from './types.otel-runtime';
import type {
  RuntimeSignal,
  RuntimeFusionState,
  SignalSource,
  SignalType,
  SignalSeverity,
  SignalAction,
  RuntimeFusionEvidenceStatus,
} from './types.runtime-fusion';

// ─── Constants ───────────────────────────────────────────────────────────────

const EXTERNAL_SIGNAL_STATE_FILE = 'PULSE_EXTERNAL_SIGNAL_STATE.json';
const RUNTIME_TRACES_FILE = 'PULSE_RUNTIME_TRACES.json';
const FUSION_OUTPUT_FILE = 'PULSE_RUNTIME_FUSION.json';
const OBSERVED_RUNTIME_TRACE_SOURCES = new Set(['otel_collector', 'datadog', 'sentry']);
const SKIPPED_ADAPTER_STATUSES = new Set(['optional_not_configured', 'skipped']);

const SEVERITY_WEIGHTS: Record<SignalSeverity, number> = {
  critical: 1.0,
  high: 0.7,
  medium: 0.4,
  low: 0.2,
  info: 0.1,
};

const TYPE_MAP: Record<string, SignalType> = {
  error: 'error',
  runtime_error: 'error',
  exception: 'error',
  crash: 'error',
  latency: 'latency',
  response_time: 'latency',
  p95: 'latency',
  p99: 'latency',
  throughput: 'throughput',
  rps: 'throughput',
  error_rate: 'error_rate',
  failure_rate: 'error_rate',
  saturation: 'saturation',
  cpu: 'saturation',
  memory: 'saturation',
  disk: 'saturation',
  deploy_failure: 'deploy_failure',
  ci_failure: 'deploy_failure',
  build_failure: 'deploy_failure',
  test_failure: 'test_failure',
  flaky_test: 'test_failure',
  coverage_drop: 'test_failure',
  graph_staleness: 'graph_staleness',
  stale_index: 'graph_staleness',
  static_hotspot: 'code_quality',
  code_quality: 'code_quality',
  codacy: 'code_quality',
  issue: 'code_quality',
  pull_request: 'change',
  change: 'change',
  dependency: 'dependency',
  dependabot: 'dependency',
};

// ─── Numeric → Categorical Mapping ──────────────────────────────────────────

/**
 * Map a numeric severity score (0..1) to a categorical {@link SignalSeverity}.
 */
function mapSeverity(score: number): SignalSeverity {
  if (score >= 0.9) return 'critical';
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  if (score >= 0.2) return 'low';
  return 'info';
}

/**
 * Map a signal type string to a canonical {@link SignalType}.
 */
function mapType(rawType: string): SignalType {
  const lower = rawType.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  for (const [key, value] of Object.entries(TYPE_MAP)) {
    if (lower.includes(key)) return value;
  }
  return 'external';
}

/**
 * Derive the required {@link SignalAction} from severity and type.
 */
function deriveAction(severity: SignalSeverity, type: SignalType): SignalAction {
  if (severity === 'critical') return 'block_deploy';
  if (severity === 'high') return 'block_merge';
  if (type === 'deploy_failure' || type === 'test_failure') return 'block_merge';
  if (type === 'graph_staleness') return 'prioritize_fix';
  if (severity === 'medium') return 'create_issue';
  return 'log_only';
}

// ─── JSON Parsing ───────────────────────────────────────────────────────────

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeJsonParseFile(filePath: string): Record<string, unknown> | null {
  if (!pathExists(filePath)) return null;
  try {
    return safeJsonParse(readTextFile(filePath, 'utf8'));
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
  if (path.basename(rootDir) === 'current' && path.basename(path.dirname(rootDir)) === '.pulse') {
    return rootDir;
  }
  return path.join(rootDir, '.pulse', 'current');
}

const SIGNAL_SOURCES: readonly SignalSource[] = [
  'github',
  'sentry',
  'datadog',
  'prometheus',
  'github_actions',
  'codacy',
  'codecov',
  'dependabot',
  'gitnexus',
  'otel_runtime',
];
const SIGNAL_SOURCE_SET = new Set<string>(SIGNAL_SOURCES);

function isSignalSource(value: string): value is SignalSource {
  return SIGNAL_SOURCE_SET.has(value);
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
  summary: string;
  observedAt: string | null;
  relatedFiles: string[];
  capabilityIds: string[];
  flowIds: string[];
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
  const sourceRaw = asString(value.source);
  if (!isSignalSource(sourceRaw) || sourceRaw === 'otel_runtime') return null;

  const truthModeRaw = asString(value.truthMode);
  const truthMode = truthModeRaw === 'inferred' ? 'inferred' : 'observed';
  const summary = asString(value.summary ?? value.message ?? value.title);

  return {
    id: asString(value.id) || `${sourceRaw}:${summary.slice(0, 80) || 'signal'}`,
    source: sourceRaw,
    type: asString(value.type) || 'external',
    truthMode,
    severity: asNumber(value.severity, 0.5),
    impactScore: asNumber(value.impactScore, asNumber(value.severity, 0.5)),
    summary: summary || `${sourceRaw} external signal`,
    observedAt: asString(value.observedAt) || null,
    relatedFiles: asStringArray(value.relatedFiles),
    capabilityIds: asStringArray(value.capabilityIds),
    flowIds: asStringArray(value.flowIds),
  };
}

function parseCanonicalExternalAdapter(value: unknown): CanonicalExternalAdapter | null {
  if (!isRecord(value)) return null;
  const source = asString(value.source);
  const status = asString(value.status);
  if (!source || !status) return null;
  return { source, status };
}

function parseCanonicalExternalSignalState(
  payload: Record<string, unknown>,
): CanonicalExternalSignalState {
  const truthModeRaw = asString(payload.truthMode);
  const truthMode = truthModeRaw === 'inferred' ? 'inferred' : 'observed';
  const signals = asArray(payload.signals)
    .map(parseCanonicalExternalSignal)
    .filter((signal): signal is CanonicalExternalSignal => signal !== null);
  const adapters = asArray(payload.adapters)
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
  const severity = mapSeverity(signal.severity);
  const type = mapType(signal.type);
  const observedAt = signal.observedAt || generatedAt;

  return {
    id: signal.id,
    source: signal.source,
    type,
    severity,
    action: deriveAction(severity, type),
    message: signal.summary,
    affectedCapabilityIds: signal.capabilityIds,
    affectedFlowIds: signal.flowIds,
    affectedFilePaths: signal.relatedFiles,
    frequency: 1,
    affectedUsers: 0,
    impactScore: signal.impactScore,
    firstSeen: observedAt,
    lastSeen: observedAt,
    count: 1,
    trend: 'unknown',
    pinned: false,
    evidenceMode: signal.truthMode,
    sourceArtifact: EXTERNAL_SIGNAL_STATE_FILE,
    observedAt: signal.observedAt,
  };
}

function loadCanonicalExternalSignals(currentDir: string): {
  signals: RuntimeSignal[];
  evidence: RuntimeFusionState['evidence']['externalSignalState'];
} {
  const artifactPath = path.join(currentDir, EXTERNAL_SIGNAL_STATE_FILE);
  const payload = safeJsonParseFile(artifactPath);
  if (!payload) {
    return {
      signals: [],
      evidence: {
        status: pathExists(artifactPath) ? 'invalid' : 'not_available',
        artifactPath,
        totalSignals: 0,
        observedSignals: 0,
        inferredSignals: 0,
        adapterStatusCounts: {},
        notAvailableAdapters: [],
        skippedAdapters: [],
        staleAdapters: [],
        invalidAdapters: [],
        reason: pathExists(artifactPath)
          ? `${EXTERNAL_SIGNAL_STATE_FILE} is not valid JSON.`
          : `${EXTERNAL_SIGNAL_STATE_FILE} is not available in .pulse/current.`,
      },
    };
  }

  const state = parseCanonicalExternalSignalState(payload);
  const signals = state.signals.map((signal) =>
    canonicalExternalSignalToRuntimeSignal(signal, state.generatedAt),
  );
  const adapterStatusCounts: Record<string, number> = {};
  const notAvailableAdapters: string[] = [];
  const skippedAdapters: string[] = [];
  const staleAdapters: string[] = [];
  const invalidAdapters: string[] = [];

  for (const adapter of state.adapters) {
    adapterStatusCounts[adapter.status] = (adapterStatusCounts[adapter.status] ?? 0) + 1;
    if (adapter.status === 'not_available') notAvailableAdapters.push(adapter.source);
    if (adapter.status === 'stale') staleAdapters.push(adapter.source);
    if (adapter.status === 'invalid') invalidAdapters.push(adapter.source);
    if (SKIPPED_ADAPTER_STATUSES.has(adapter.status)) skippedAdapters.push(adapter.source);
  }

  const observedSignals = state.signals.filter((signal) => signal.truthMode === 'observed').length;
  const inferredSignals = state.signals.length - observedSignals;
  const status: RuntimeFusionEvidenceStatus =
    state.signals.length > 0
      ? state.truthMode
      : skippedAdapters.length > 0
        ? 'skipped'
        : 'observed';

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
          ? `${state.signals.length} canonical external signal(s) loaded from ${EXTERNAL_SIGNAL_STATE_FILE}.`
          : `No canonical external signals were present in ${EXTERNAL_SIGNAL_STATE_FILE}.`,
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
function otelErrorSpanToSignal(span: OtelSpan, traceId: string): RuntimeSignal {
  const httpMethod = (span.attributes['http.method'] as string) || '';
  const httpRoute = (span.attributes['http.route'] as string) || '';
  const httpStatus = (span.attributes['http.status_code'] as number) || 0;
  const structuralFrom = (span.attributes['pulse.structural.from'] as string) || '';
  const structuralTo = (span.attributes['pulse.structural.to'] as string) || '';

  const requestDesc = httpMethod && httpRoute ? `${httpMethod} ${httpRoute}` : span.name;
  const statusMsg = span.statusMessage || `${requestDesc} returned status ${httpStatus || 'error'}`;

  const message = `[OTel] ${span.serviceName}: ${statusMsg}`;
  const affectedFilePaths = [structuralFrom, structuralTo].filter(Boolean);

  const id = `otel:error:${span.spanId}:${span.serviceName}:${span.name.slice(0, 60)}`;

  return {
    id,
    source: 'otel_runtime',
    type: 'error',
    severity: httpStatus >= 500 ? 'critical' : httpStatus >= 400 ? 'high' : 'medium',
    action: httpStatus >= 500 ? 'block_deploy' : httpStatus >= 400 ? 'block_merge' : 'create_issue',
    message,
    affectedCapabilityIds: [],
    affectedFlowIds: [],
    affectedFilePaths,
    frequency: 1,
    affectedUsers: 0,
    impactScore: httpStatus >= 500 ? 0.9 : httpStatus >= 400 ? 0.6 : 0.3,
    firstSeen: span.startTime,
    lastSeen: span.endTime,
    count: 1,
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
  traceCount: number,
): RuntimeSignal {
  const id = `otel:latency:${endpoint.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60)}`;
  const severity = p95Ms > 5000 ? 'high' : p95Ms > 1000 ? 'medium' : 'low';

  return {
    id,
    source: 'otel_runtime',
    type: 'latency',
    severity,
    action: severity === 'high' ? 'prioritize_fix' : 'log_only',
    message: `[OTel] ${endpoint}: avg=${avgMs}ms, p95=${p95Ms}ms across ${traceCount} traces`,
    affectedCapabilityIds: [],
    affectedFlowIds: [],
    affectedFilePaths: [],
    frequency: traceCount,
    affectedUsers: 0,
    impactScore: severity === 'high' ? 0.6 : severity === 'medium' ? 0.3 : 0.1,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    count: traceCount,
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
  const signals: RuntimeSignal[] = [];

  for (const trace of evidence.traces) {
    for (const span of trace.spans) {
      if (span.status === 'error') {
        signals.push(otelErrorSpanToSignal(span, trace.traceId));
      }
    }
  }

  for (const [endpoint, count] of Object.entries(evidence.summary.endpointMap)) {
    if (count < 2) continue;
    const p95 = evidence.summary.p95DurationMs;
    const avg = evidence.summary.avgDurationMs;
    if (p95 > 500 || avg > 300) {
      signals.push(otelLatencyToSignal(endpoint, avg, p95, count));
    }
  }

  for (const mapping of evidence.spanToPathMappings) {
    if (mapping.confidence < 0.5) continue;
    const filePaths = mapping.matchedFilePaths;
    if (filePaths.length === 0) continue;

    for (const signal of signals) {
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
  const artifactPath = path.join(currentDir, RUNTIME_TRACES_FILE);
  const payload = safeJsonParseFile(artifactPath);
  if (!payload) {
    return {
      signals: [],
      evidence: {
        status: pathExists(artifactPath) ? 'invalid' : 'not_available',
        artifactPath,
        source: null,
        totalTraces: 0,
        totalSpans: 0,
        errorTraces: 0,
        derivedSignals: 0,
        reason: pathExists(artifactPath)
          ? `${RUNTIME_TRACES_FILE} is not valid JSON.`
          : `${RUNTIME_TRACES_FILE} is not available in .pulse/current.`,
      },
    };
  }

  const source = asString(payload.source);
  const summary = isRecord(payload.summary) ? payload.summary : {};
  const totalTraces = asNumber(summary.totalTraces, asArray(payload.traces).length);
  const totalSpans = asNumber(summary.totalSpans, 0);
  const errorTraces = asNumber(summary.errorTraces, 0);

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

  if (!OBSERVED_RUNTIME_TRACE_SOURCES.has(source)) {
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

  const signals = runtimeTraceEvidenceToSignals(payload);

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
  const ids = new Set(signal.affectedCapabilityIds);

  if (capabilityState?.capabilities) {
    const messageTokens = new Set(tokenize(signal.message));

    for (const capability of capabilityState.capabilities) {
      const nameTokens = tokenize(capability.name);

      const hasNameMatch = nameTokens.some((nt) => nt.length >= 3 && messageTokens.has(nt));

      const hasFilePathMatch = signal.affectedFilePaths.some((signalFile) =>
        (capability.filePaths ?? []).some(
          (capFile) =>
            capFile.replace(/\\/g, '/').includes(signalFile.replace(/\\/g, '/')) ||
            signalFile.replace(/\\/g, '/').includes(capFile.replace(/\\/g, '/')),
        ),
      );

      if (hasNameMatch || hasFilePathMatch) {
        ids.add(capability.id);
      }
    }
  }

  return Array.from(ids);
}

// ─── Impact Score Computation ───────────────────────────────────────────────

/**
 * Compute an impact score (0..1) for a runtime signal based on severity,
 * frequency, and affected user count.
 *
 * The formula is: severity_weight × log10(frequency + 1) × log10(affectedUsers + 1),
 * normalized to 0..1.
 *
 * @param signal - The runtime signal to score.
 * @returns Impact score in the range 0..1.
 */
export function computeImpactScore(signal: RuntimeSignal): number {
  const sevWeight = SEVERITY_WEIGHTS[signal.severity] ?? 0.5;
  const freqLog = Math.log10(Math.max(signal.frequency, 1) + 1);
  const userLog = Math.log10(Math.max(signal.affectedUsers, 1) + 1);

  const raw = sevWeight * freqLog * userLog;

  const maxFreq = 6; // log10(1e6 + 1) ≈ 6
  const maxUser = 6; // log10(1e6 + 1) ≈ 6
  const denom = 1.0 * maxFreq * maxUser;

  return denom > 0 ? Math.min(1, raw / denom) : 0;
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
  const overrides = fusionState.priorityOverrides.slice();

  for (const capId of Object.keys(fusionState.summary.signalsByCapability)) {
    const capabilitySignals = fusionState.signals.filter((s) =>
      s.affectedCapabilityIds.includes(capId),
    );

    const hasCritical = capabilitySignals.some((s) => s.severity === 'critical');
    const hasHigh = capabilitySignals.some((s) => s.severity === 'high');

    if (!hasCritical && !hasHigh) continue;

    let originalPriority = 'P2';
    if (convergencePlan) {
      if (convergencePlan.priorities?.[capId]) {
        originalPriority = convergencePlan.priorities[capId];
      } else if (convergencePlan.units) {
        const unit = convergencePlan.units.find(
          (u) => u.capabilityId === capId || u.name === capId,
        );
        if (unit) originalPriority = unit.priority;
      }
    }

    if (originalPriority === 'P0') continue;

    const uniqueSources = unique(capabilitySignals.map((s) => s.source));
    const reasons = capabilitySignals
      .filter((s) => s.severity === 'critical' || s.severity === 'high')
      .map((s) => `[${s.severity}] ${s.message.slice(0, 100)}`)
      .slice(0, 3);

    overrides.push({
      capabilityId: capId,
      originalPriority,
      newPriority: 'P0',
      reason: `Runtime ${hasCritical ? 'critical' : 'high'} signals from ${uniqueSources.join(', ')}: ${reasons.join('; ')}`,
    });
  }

  return { ...fusionState, priorityOverrides: overrides };
}

// ─── Runtime Reality Ranking ────────────────────────────────────────────────

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

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
 * @param staticPriority - The current static priority (P0–P3).
 * @returns The final priority string.
 */
export function rankByRuntimeReality(signals: RuntimeSignal[], staticPriority: string): string {
  if (signals.length === 0) return staticPriority;

  const activeSignals = signals.filter((s) => !s.pinned || s.severity !== 'info');
  if (activeSignals.length === 0) return staticPriority;

  const severities = activeSignals.map((s) => s.severity);
  const types = activeSignals.map((s) => s.type);

  let runtimePriority = staticPriority;

  if (severities.includes('critical')) {
    runtimePriority = 'P0';
  } else if (types.includes('deploy_failure') || types.includes('error_rate')) {
    runtimePriority = 'P0';
  } else if (severities.includes('high')) {
    runtimePriority = 'P1';
  } else if (types.includes('error') || types.includes('test_failure')) {
    runtimePriority = 'P1';
  } else if (types.includes('latency') || types.includes('saturation')) {
    runtimePriority = 'P2';
  }

  const runtimeRank = PRIORITY_RANK[runtimePriority] ?? 2;
  const staticRank = PRIORITY_RANK[staticPriority] ?? 2;

  return runtimeRank <= staticRank ? runtimePriority : staticPriority;
}

// ─── Summary Generation ─────────────────────────────────────────────────────

function buildSummary(
  signals: RuntimeSignal[],
  capabilityState?: { capabilities?: Array<{ id: string }> },
): RuntimeFusionState['summary'] {
  const totalSignals = signals.length;
  const criticalSignals = signals.filter((s) => s.severity === 'critical').length;
  const highSignals = signals.filter((s) => s.severity === 'high').length;
  const blockMergeSignals = signals.filter(
    (s) => s.action === 'block_merge' || s.action === 'block_deploy',
  ).length;
  const blockDeploySignals = signals.filter((s) => s.action === 'block_deploy').length;

  const sourceCounts = emptySourceCounts();
  for (const s of signals) {
    sourceCounts[s.source] = (sourceCounts[s.source] ?? 0) + 1;
  }

  const signalsByCapability: Record<string, number> = {};
  const signalsByFlow: Record<string, number> = {};
  const capImpactAccum: Record<string, number> = {};
  const flowImpactAccum: Record<string, number> = {};

  for (const s of signals) {
    for (const capId of s.affectedCapabilityIds) {
      signalsByCapability[capId] = (signalsByCapability[capId] ?? 0) + 1;
      capImpactAccum[capId] = (capImpactAccum[capId] ?? 0) + s.impactScore;
    }
    for (const flowId of s.affectedFlowIds) {
      signalsByFlow[flowId] = (signalsByFlow[flowId] ?? 0) + 1;
      flowImpactAccum[flowId] = (flowImpactAccum[flowId] ?? 0) + s.impactScore;
    }
  }

  const topImpactCapabilities = Object.entries(capImpactAccum)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([capabilityId, impactScore]) => ({ capabilityId, impactScore }));

  const topImpactFlows = Object.entries(flowImpactAccum)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
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
  const currentDir = resolvePulseCurrentDir(rootDir);
  const externalSignals = loadCanonicalExternalSignals(currentDir);
  const runtimeTraces = loadRuntimeTraceEvidence(currentDir);
  const allSignals: RuntimeSignal[] = [...externalSignals.signals, ...runtimeTraces.signals];

  // Try loading capability state for signal→capability mapping context
  const capabilityStatePath = path.join(currentDir, 'PULSE_CAPABILITY_STATE.json');
  const capabilityPayload = safeJsonParseFile(capabilityStatePath);
  const capabilityState = capabilityPayload
    ? (capabilityPayload as unknown as {
        capabilities?: Array<{ id: string; name: string; filePaths?: string[] }>;
      })
    : undefined;

  // Map signals to capabilities where not already mapped
  for (const signal of allSignals) {
    const mapped = mapSignalToCapabilities(signal, capabilityState);
    if (mapped.length > 0 && signal.affectedCapabilityIds.length === 0) {
      signal.affectedCapabilityIds = mapped;
    }
    // Recompute impact score using the fusion formula
    signal.impactScore = computeImpactScore(signal);
  }

  // Load convergence plan for priority context
  const convergencePlanPath = path.join(currentDir, 'PULSE_CONVERGENCE_PLAN.json');
  const convergencePayload = safeJsonParseFile(convergencePlanPath);
  const convergencePlan = convergencePayload
    ? (convergencePayload as unknown as {
        priorities?: Record<string, string>;
        units?: Array<{ capabilityId?: string; priority: string; name?: string }>;
      })
    : undefined;

  const summary = buildSummary(allSignals, capabilityState);

  let state: RuntimeFusionState = {
    generatedAt: new Date().toISOString(),
    signals: allSignals,
    summary,
    evidence: {
      externalSignalState: externalSignals.evidence,
      runtimeTraces: runtimeTraces.evidence,
    },
    priorityOverrides: [],
  };

  state = overridePriorities(state, convergencePlan);

  if (!pathExists(currentDir)) {
    ensureDir(currentDir, { recursive: true });
  }
  writeTextFile(path.join(currentDir, FUSION_OUTPUT_FILE), JSON.stringify(state, null, 2));

  return state;
}
