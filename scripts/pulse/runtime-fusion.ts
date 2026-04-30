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
  OperationalEvidenceKind,
  RuntimeFusionMachineImprovementSignal,
} from './types.runtime-fusion';

// ─── Constants ───────────────────────────────────────────────────────────────

const EXTERNAL_SIGNAL_STATE_FILE = 'PULSE_EXTERNAL_SIGNAL_STATE.json';
const RUNTIME_TRACES_FILE = 'PULSE_RUNTIME_TRACES.json';
const FUSION_OUTPUT_FILE = 'PULSE_RUNTIME_FUSION.json';
const OBSERVED_RUNTIME_TRACE_SOURCES = new Set([
  'real',
  'manual',
  'otel_collector',
  'datadog',
  'sentry',
]);
const SKIPPED_ADAPTER_STATUSES = new Set(['optional_not_configured', 'skipped']);

const DYNAMIC_SIGNAL_SEMANTICS_NOTE =
  'Dynamic signal semantics derived from source capability, observed payload, runtime baseline, trend, impact, and blast-radius hints; legacy labels are weak calibration only.';

const WEAK_SEMANTIC_HINTS: Record<OperationalEvidenceKind, readonly string[]> = {
  runtime: [
    'runtime',
    'error',
    'exception',
    'crash',
    'latency',
    'response',
    'p95',
    'p99',
    'throughput',
    'rps',
    'saturation',
    'cpu',
    'memory',
    'disk',
    'incident',
    'timeout',
    'trace',
    'span',
  ],
  change: [
    'change',
    'pull',
    'request',
    'commit',
    'deploy',
    'build',
    'ci',
    'test',
    'coverage',
    'regression',
    'workflow',
  ],
  static: [
    'static',
    'quality',
    'codacy',
    'lint',
    'smell',
    'complexity',
    'duplication',
    'hotspot',
    'graph',
    'stale',
    'rule',
  ],
  dependency: [
    'dependency',
    'dependabot',
    'vulnerability',
    'vuln',
    'cve',
    'supply',
    'package',
    'lockfile',
    'version',
  ],
  external: [],
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
 * Keep legacy words as calibration only. They can break ties, but they do not
 * define signal semantics without payload/source evidence.
 */
function weakHintScore(kind: OperationalEvidenceKind, tokens: Set<string>): number {
  const hints = WEAK_SEMANTIC_HINTS[kind];
  if (hints.length === 0) return 0;
  const matches = hints.filter((hint) => tokens.has(hint)).length;
  return Math.min(0.18, matches * 0.04);
}

function sourceCapabilityScore(source: SignalSource, kind: OperationalEvidenceKind): number {
  if (kind === 'runtime' && ['sentry', 'datadog', 'prometheus', 'otel_runtime'].includes(source)) {
    return 0.35;
  }
  if (kind === 'change' && ['github', 'github_actions', 'codecov'].includes(source)) {
    return 0.3;
  }
  if (kind === 'static' && ['codacy', 'codecov', 'gitnexus'].includes(source)) {
    return 0.3;
  }
  if (kind === 'dependency' && source === 'dependabot') {
    return 0.35;
  }
  if (kind === 'external') return 0.05;
  return 0;
}

function flattenPayloadTokens(value: unknown): string[] {
  if (typeof value === 'string') return tokenize(value);
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPayloadTokens);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...tokenize(key),
    ...flattenPayloadTokens(entry),
  ]);
}

function payloadSignalScore(
  kind: OperationalEvidenceKind,
  signal: CanonicalExternalSignal,
): number {
  const payload = signal.observedPayload;
  const payloadTokens = new Set(flattenPayloadTokens(payload));
  const hasAny = (...keys: string[]): boolean => keys.some((key) => payloadTokens.has(key));

  if (kind === 'runtime') {
    let score = 0;
    if (hasAny('trace', 'span', 'status', 'statuscode', 'exception', 'duration', 'latency')) {
      score += 0.36;
    }
    if (signal.observedAt) score += 0.12;
    if (signal.runtimeBaselineScore > 0) score += 0.15;
    if (signal.trend === 'worsening') score += 0.1;
    return Math.min(0.65, score);
  }

  if (kind === 'change') {
    let score = 0;
    if (hasAny('commit', 'pull', 'request', 'branch', 'workflow', 'deployment', 'build'))
      score += 0.34;
    if (hasAny('diff', 'changed', 'coverage', 'test', 'regression')) score += 0.18;
    return Math.min(0.55, score);
  }

  if (kind === 'static') {
    let score = 0;
    if (hasAny('rule', 'finding', 'complexity', 'duplication', 'lint', 'graph', 'file'))
      score += 0.34;
    if (signal.relatedFiles.length > 0) score += 0.12;
    return Math.min(0.55, score);
  }

  if (kind === 'dependency') {
    let score = 0;
    if (hasAny('package', 'dependency', 'version', 'lockfile', 'manifest')) score += 0.32;
    if (hasAny('cve', 'vulnerability', 'advisory', 'supply')) score += 0.18;
    return Math.min(0.55, score);
  }

  return 0;
}

function deriveOperationalEvidenceKind(signal: CanonicalExternalSignal): OperationalEvidenceKind {
  const tokens = new Set([
    ...tokenize(signal.source),
    ...tokenize(signal.type),
    ...tokenize(signal.summary),
    ...signal.relatedFiles.flatMap(tokenize),
    ...flattenPayloadTokens(signal.observedPayload),
  ]);

  const candidates: OperationalEvidenceKind[] = ['runtime', 'change', 'static', 'dependency'];
  const ranked = candidates
    .map((kind) => ({
      kind,
      score:
        payloadSignalScore(kind, signal) +
        sourceCapabilityScore(signal.source, kind) +
        weakHintScore(kind, tokens),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return best && best.score >= 0.22 ? best.kind : 'external';
}

function deriveSignalType(
  evidenceKind: OperationalEvidenceKind,
  signal: CanonicalExternalSignal,
): SignalType {
  const tokens = new Set([
    ...tokenize(signal.type),
    ...tokenize(signal.summary),
    ...flattenPayloadTokens(signal.observedPayload),
  ]);
  const hasAny = (...keys: string[]): boolean => keys.some((key) => tokens.has(key));

  if (evidenceKind === 'runtime') {
    if (hasAny('error', 'exception', 'crash', 'timeout', 'statuscode500', 'statuscode')) {
      return 'error';
    }
    if (hasAny('latency', 'duration', 'response', 'p95', 'p99')) return 'latency';
    if (hasAny('throughput', 'rps')) return 'throughput';
    if (hasAny('saturation', 'cpu', 'memory', 'disk')) return 'saturation';
    return 'runtime';
  }

  if (evidenceKind === 'change') {
    if (hasAny('deploy', 'deployment', 'ci', 'build', 'workflow')) return 'deploy_failure';
    if (hasAny('test', 'coverage', 'regression', 'flaky')) return 'test_failure';
    return 'change';
  }

  if (evidenceKind === 'static') {
    if (hasAny('stale', 'graph', 'index')) return 'graph_staleness';
    if (hasAny('quality', 'codacy', 'lint', 'complexity', 'duplication', 'smell', 'rule')) {
      return 'code_quality';
    }
    return 'static';
  }

  if (evidenceKind === 'dependency') return 'dependency';
  return 'external';
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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

function runtimeRealityWeight(signal: RuntimeSignal): number {
  if (signal.evidenceMode === 'observed' && signal.evidenceKind === 'runtime') return 1;
  if (
    signal.evidenceMode === 'observed' &&
    (signal.evidenceKind === 'change' || signal.evidenceKind === 'dependency')
  ) {
    return 0.86;
  }
  if (signal.evidenceMode === 'observed' && signal.evidenceKind === 'static') return 0.58;
  if (signal.evidenceMode === 'inferred' && signal.evidenceKind === 'runtime') return 0.62;
  if (signal.evidenceMode === 'inferred') return 0.42;
  return 0.25;
}

function normalizeImpactByRuntimeReality(signal: RuntimeSignal, impactScore: number): number {
  const weighted = clampScore(impactScore) * runtimeRealityWeight(signal);
  if (signal.evidenceMode === 'observed' && signal.evidenceKind === 'runtime') {
    return clampScore(Math.max(weighted, signal.type === 'error' ? 0.82 : 0.72));
  }
  if (signal.evidenceKind === 'static') {
    return Math.min(0.69, weighted);
  }
  return clampScore(weighted);
}

function isDecisiveRuntimeRealitySignal(signal: RuntimeSignal): boolean {
  return (
    signal.evidenceMode === 'observed' &&
    (signal.evidenceKind === 'runtime' ||
      signal.evidenceKind === 'change' ||
      signal.evidenceKind === 'dependency')
  );
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
  if (path.basename(rootDir) === 'current' && path.basename(path.dirname(rootDir)) === '.pulse') {
    return rootDir;
  }
  return path.join(rootDir, '.pulse', 'current');
}

function syncAffectedAliases(signal: RuntimeSignal): void {
  signal.affectedCapabilityIds = unique(signal.affectedCapabilityIds);
  signal.affectedFlowIds = unique(signal.affectedFlowIds);
  signal.affectedCapabilities = signal.affectedCapabilityIds;
  signal.affectedFlows = signal.affectedFlowIds;
}

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
  runtimeBaselineScore: number;
  blastRadiusScore: number;
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
  const sourceRaw = asString(value.source);
  if (!isSignalSource(sourceRaw) || sourceRaw === 'otel_runtime') return null;

  const truthModeRaw = asString(value.truthMode);
  const truthMode = truthModeRaw === 'inferred' ? 'inferred' : 'observed';
  const summary = asString(value.summary ?? value.message ?? value.title);
  const explicitSeverity = asOptionalNumber(value.severity);
  const explicitImpact = asOptionalNumber(value.impactScore);
  const runtimeBaselineScore = clampScore(
    asNumber(value.runtimeBaselineScore ?? value.baselineScore ?? value.baselineDelta, 0),
  );
  const blastRadiusScore = clampScore(
    asNumber(value.blastRadiusScore ?? value.blastRadius ?? value.blastRadiusImpact, 0),
  );

  return {
    id: asString(value.id) || `${sourceRaw}:${summary.slice(0, 80) || 'signal'}`,
    source: sourceRaw,
    type: asString(value.type) || 'external',
    truthMode,
    severity: clampScore(explicitSeverity ?? explicitImpact ?? 0.5),
    impactScore: clampScore(explicitImpact ?? explicitSeverity ?? 0.5),
    runtimeBaselineScore,
    blastRadiusScore,
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
    confidence: clampScore(asNumber(value.confidence, 0.8)),
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
  const observedPayload = value.observedPayload ?? value.payload ?? value.metrics ?? {};
  return isRecord(observedPayload) ? observedPayload : {};
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
  const evidenceKind = deriveOperationalEvidenceKind(signal);
  const type = deriveSignalType(evidenceKind, signal);
  const semanticSeverityScore = clampScore(
    Math.max(
      signal.severity,
      signal.impactScore * 0.8,
      signal.runtimeBaselineScore,
      signal.blastRadiusScore,
      signal.trend === 'worsening' ? 0.7 : 0,
    ),
  );
  const severity = mapSeverity(semanticSeverityScore);
  const observedAt = signal.observedAt || generatedAt;
  const affectedCapabilityIds = unique(signal.capabilityIds);
  const affectedFlowIds = unique(signal.flowIds);
  const impactScore = clampScore(
    Math.max(
      signal.impactScore,
      signal.runtimeBaselineScore,
      signal.blastRadiusScore,
      signal.affectedUsers > 0 ? Math.min(1, Math.log10(signal.affectedUsers + 1) / 6) : 0,
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
    impactScore,
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
  const httpMethod = (span.attributes['http.method'] as string) || '';
  const httpRoute = (span.attributes['http.route'] as string) || '';
  const httpStatus = (span.attributes['http.status_code'] as number) || 0;
  const structuralFrom = (span.attributes['pulse.structural.from'] as string) || '';
  const structuralTo = (span.attributes['pulse.structural.to'] as string) || '';

  const requestDesc = httpMethod && httpRoute ? `${httpMethod} ${httpRoute}` : span.name;
  const statusMsg = span.statusMessage || `${requestDesc} returned status ${httpStatus || 'error'}`;

  const message = `[OTel] ${span.serviceName}: ${statusMsg}`;
  const affectedFilePaths = unique([
    ...mappedFilePaths,
    ...[structuralFrom, structuralTo].filter(
      (value) => value.includes('/') || value.includes('\\'),
    ),
  ]);

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
    confidence: 0.9,
    evidenceKind: 'runtime',
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
    confidence: 0.85,
    evidenceKind: 'runtime',
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
  const mappedPathsBySpanName = new Map<string, string[]>();

  for (const mapping of evidence.spanToPathMappings) {
    if (mapping.confidence < 0.5 || mapping.matchedFilePaths.length === 0) continue;
    mappedPathsBySpanName.set(
      mapping.spanName,
      unique([...(mappedPathsBySpanName.get(mapping.spanName) ?? []), ...mapping.matchedFilePaths]),
    );
  }

  for (const trace of evidence.traces) {
    for (const span of trace.spans) {
      if (span.status === 'error') {
        signals.push(
          otelErrorSpanToSignal(span, trace.traceId, mappedPathsBySpanName.get(span.name) ?? []),
        );
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
  const sourceDetails = isRecord(payload.sourceDetails) ? payload.sourceDetails : {};
  const runtimeObserved = sourceDetails.runtimeObserved === true;
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

  if (!OBSERVED_RUNTIME_TRACE_SOURCES.has(source) && !runtimeObserved) {
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
  const signals: RuntimeFusionMachineImprovementSignal[] = [];

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

  const adapterGaps = [
    ...externalEvidence.notAvailableAdapters.map((adapterName) => ({
      adapterName,
      status: 'not_available',
    })),
    ...externalEvidence.staleAdapters.map((adapterName) => ({ adapterName, status: 'stale' })),
    ...externalEvidence.invalidAdapters.map((adapterName) => ({ adapterName, status: 'invalid' })),
  ];

  for (const { adapterName, status } of adapterGaps) {
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
  const ids = new Set(signal.affectedCapabilityIds);

  if (capabilityState?.capabilities) {
    const messageTokens = new Set(tokenize(signal.message));
    const hasObservedFileHints = signal.affectedFilePaths.length > 0;

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
  const ids = new Set(signal.affectedFlowIds);
  if (!flowProjection?.flows) return Array.from(ids);

  const messageTokens = new Set(tokenize(signal.message));
  for (const flow of flowProjection.flows) {
    const capabilityMatch = (flow.capabilityIds ?? []).some((capabilityId) =>
      signal.affectedCapabilityIds.includes(capabilityId),
    );
    const routeMatch = (flow.routePatterns ?? []).some((routePattern) =>
      signal.message.includes(routePattern),
    );
    const nameMatch = tokenize(flow.name).some(
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
  const severityOrder: SignalSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
  const severityOrdinal = severityOrder.indexOf(signal.severity);
  const severityPressure =
    severityOrdinal >= 0 ? (severityOrdinal + 1) / severityOrder.length : 0.5;
  const freqLog = Math.log10(Math.max(signal.frequency, 1) + 1);
  const userLog = Math.log10(Math.max(signal.affectedUsers, 1) + 1);
  const trendPressure =
    signal.trend === 'worsening' ? 0.2 : signal.trend === 'improving' ? -0.1 : 0;
  const actionPressure =
    signal.action === 'block_deploy' ? 0.25 : signal.action === 'block_merge' ? 0.15 : 0;

  const observedMagnitude = (freqLog + userLog) / 12;
  const raw = observedMagnitude + severityPressure * 0.2 + trendPressure + actionPressure;

  return clampScore(raw);
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
    const capabilitySignals = fusionState.signals.filter(
      (s) => s.affectedCapabilityIds.includes(capId) && isDecisiveRuntimeRealitySignal(s),
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
      reason: `Dynamic signal semantics found ${hasCritical ? 'critical' : 'high'} operational impact from ${uniqueSources.join(', ')}: ${reasons.join('; ')}`,
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

  const activeSignals = signals.filter(
    (s) => (!s.pinned || s.severity !== 'info') && isDecisiveRuntimeRealitySignal(s),
  );
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
  const flowProjectionPath = path.join(currentDir, 'PULSE_FLOW_PROJECTION.json');
  const flowProjectionPayload = safeJsonParseFile(flowProjectionPath);
  const flowProjection = flowProjectionPayload
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
  for (const signal of allSignals) {
    const mapped = mapSignalToCapabilities(signal, capabilityState);
    signal.affectedCapabilityIds = unique([...signal.affectedCapabilityIds, ...mapped]);
    const mappedFlows = mapSignalToFlows(signal, flowProjection);
    signal.affectedFlowIds = unique([...signal.affectedFlowIds, ...mappedFlows]);
    signal.affectedCapabilityIds = unique([
      ...signal.affectedCapabilityIds,
      ...mapCapabilitiesFromFlows(signal, flowProjection),
    ]);
    // Recompute impact score using the fusion formula
    signal.impactScore = normalizeImpactByRuntimeReality(
      signal,
      Math.max(clampScore(signal.impactScore), computeImpactScore(signal)),
    );
    signal.confidence = clampScore(signal.confidence);
    syncAffectedAliases(signal);
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
    machineImprovementSignals: buildMachineImprovementSignals(
      externalSignals.evidence,
      runtimeTraces.evidence,
    ),
  };

  state = overridePriorities(state, convergencePlan);

  if (!pathExists(currentDir)) {
    ensureDir(currentDir, { recursive: true });
  }
  writeTextFile(path.join(currentDir, FUSION_OUTPUT_FILE), JSON.stringify(state, null, 2));

  return state;
}
