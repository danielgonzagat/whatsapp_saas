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

import * as p from 'path';
import { pathExists as existsAt, readTextFile, writeTextFile, ensureDir } from './safe-fs';
import { tokenize, unique } from './signal-normalizers';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverConvergenceUnitPriorityLabels,
  discoverExternalAdapterStatusLabels,
  discoverOperationalEvidenceKindLabels,
  discoverRouteSeparatorFromRuntime,
  discoverRuntimeFusionEvidenceStatusLabels,
  discoverSignalActionLabels,
  discoverSignalSeverityLabels,
  discoverSignalSourceLabels,
  discoverSignalTypeLabels,
  discoverTruthModeLabels,
  deriveStringUnionMembersFromTypeContract,
  deriveVerificationThresholdFromObservedCatalog,
} from './dynamic-reality-kernel';
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

let EXTERNAL_SIGNAL_STATE_FILE = discoverAllObservedArtifactFilenames().externalSignalState;
let RUNTIME_TRACES_FILE = discoverAllObservedArtifactFilenames().runtimeTraces;
let FUSION_OUTPUT_FILE = discoverAllObservedArtifactFilenames().runtimeFusion;

let DYNAMIC_SIGNAL_SEMANTICS_NOTE = `Dynamic signal semantics derived from ${discoverAllObservedArtifactFilenames().externalSignalState} source capability, observed payload, runtime baseline, trend, impact, and blast-radius hints; legacy labels are weak calibration only.`;

let EVIDENCE_STATUS_LABELS = discoverRuntimeFusionEvidenceStatusLabels();
let EVIDENCE_NOT_AVAILABLE = [...EVIDENCE_STATUS_LABELS].find((l) => /^not.?avail/i.test(l))!;
let EVIDENCE_INVALID = [...EVIDENCE_STATUS_LABELS].find((l) => /invalid/i.test(l))!;
let EVIDENCE_SKIPPED = [...EVIDENCE_STATUS_LABELS].find((l) => /skip/i.test(l))!;
let EVIDENCE_SIMULATED = [...EVIDENCE_STATUS_LABELS].find((l) => /simul/i.test(l))!;

let TRUTH_LABELS = discoverTruthModeLabels();
let TRUTH_OBSERVED = [...TRUTH_LABELS].find((l) => /^observ/i.test(l))!;
let TRUTH_INFERRED = [...TRUTH_LABELS].find((l) => /^infer/i.test(l))!;

let SEVERITY_LABELS = discoverSignalSeverityLabels();
let SEVERITY_CRITICAL = [...SEVERITY_LABELS].find((l) => /^crit/i.test(l))!;
let SEVERITY_HIGH = [...SEVERITY_LABELS].find((l) => /^high/i.test(l))!;
let SEVERITY_MEDIUM = [...SEVERITY_LABELS].find((l) => /^med/i.test(l))!;
let SEVERITY_LOW = [...SEVERITY_LABELS].find((l) => /^low/i.test(l))!;
let SEVERITY_INFO = [...SEVERITY_LABELS].find((l) => /^info/i.test(l))!;

let ACTION_LABELS = discoverSignalActionLabels();
let ACTION_BLOCK_DEPLOY = [...ACTION_LABELS].find((l) => /deploy/i.test(l))!;
let ACTION_BLOCK_MERGE = [...ACTION_LABELS].find((l) => /merge/i.test(l))!;
let ACTION_PRIORITIZE = [...ACTION_LABELS].find((l) => /priorit/i.test(l))!;
let ACTION_CREATE_ISSUE = [...ACTION_LABELS].find((l) => /issue/i.test(l))!;
let ACTION_LOG_ONLY = [...ACTION_LABELS].find((l) => /log/i.test(l))!;

let TYPE_LABELS = discoverSignalTypeLabels();
let TYPE_DEPLOY_FAILURE = [...TYPE_LABELS].find((l) => /deploy_fail/i.test(l))!;
let TYPE_TEST_FAILURE = [...TYPE_LABELS].find((l) => /test_fail/i.test(l))!;
let TYPE_GRAPH_STALENESS = [...TYPE_LABELS].find((l) => /graph_stale/i.test(l))!;
let TYPE_ERROR = [...TYPE_LABELS].find((l) => l === 'error')!;
let TYPE_LATENCY = [...TYPE_LABELS].find((l) => l === 'latency')!;

let EVIDENCE_KIND_LABELS = discoverOperationalEvidenceKindLabels();
let EVIDENCE_KIND_RUNTIME = [...EVIDENCE_KIND_LABELS].find((l) => l === 'runtime')!;
let EVIDENCE_KIND_CHANGE = [...EVIDENCE_KIND_LABELS].find((l) => l === 'change')!;
let EVIDENCE_KIND_STATIC = [...EVIDENCE_KIND_LABELS].find((l) => l === 'static')!;
let EVIDENCE_KIND_DEPENDENCY = [...EVIDENCE_KIND_LABELS].find((l) => l === 'dependency')!;
let EVIDENCE_KIND_EXTERNAL = [...EVIDENCE_KIND_LABELS].find((l) => /^ext/i.test(l))!;

let ADAPTER_STALE = [...discoverExternalAdapterStatusLabels()].find((l) => l === 'stale')!;

// ─── Numeric → Categorical Mapping ──────────────────────────────────────────

/**
 * Map a numeric severity score (0..1) to a categorical {@link SignalSeverity}.
 */
function mapSeverity(value: number): SignalSeverity {
  if (value >= 0.9) return SEVERITY_CRITICAL;
  if (value >= 0.7) return SEVERITY_HIGH;
  if (value >= 0.4) return SEVERITY_MEDIUM;
  if (value >= 0.2) return SEVERITY_LOW;
  return SEVERITY_INFO;
}

/**
 * Keep legacy words as calibration only. They can break ties, but they do not
 * define signal semantics without payload/source evidence.
 */
function tokenizeEvidenceTerm(value: string): string[] {
  let expanded = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_./:-]+/g, ' ');
  return unique([...tokenize(value), ...tokenize(expanded)]);
}

function flattenPayloadTokens(value: unknown): string[] {
  if (typeof value === 'string') return tokenizeEvidenceTerm(value);
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPayloadTokens);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...tokenizeEvidenceTerm(key),
    ...flattenPayloadTokens(entry),
  ]);
}

function evidenceTokens(signal: CanonicalExternalSignal, scope: 'all' | 'payload'): Set<string> {
  return new Set(
    scope === 'payload'
      ? flattenPayloadTokens(signal.observedPayload)
      : [
          ...tokenize(signal.source),
          ...tokenize(signal.type),
          ...tokenize(signal.summary),
          ...signal.relatedFiles.flatMap(tokenize),
          ...flattenPayloadTokens(signal.observedPayload),
        ],
  );
}

function tokenDensity(tokens: Set<string>, pattern: RegExp): number {
  let hits = [...tokens].filter((token) => pattern.test(token)).length;
  if (hits === 0) return 0;
  return bound01(hits / Math.max(1, Math.sqrt(tokens.size)));
}

function positiveSignal(value: number): number {
  return value > 0 ? bound01(Math.log10(value + 1)) : 0;
}

function trendSignal(trend: RuntimeSignal['trend']): number {
  let worse = [...TREND_LABELS].find((l) => /wors/i.test(l))!;
  let better = [...TREND_LABELS].find((l) => /impr/i.test(l))!;
  if (trend === worse) return deriveUnitValue();
  if (trend === better) return -(deriveUnitValue() + deriveUnitValue()) / (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue());
  return deriveZeroValue();
}

function observedInfluence(signal: CanonicalExternalSignal): number {
  return bound01(signal.impactScore / Math.max(signal.impactScore, signal.severity, 1));
}

function average(values: number[]): number {
  if (values.length === deriveZeroValue()) return deriveZeroValue();
  return values.reduce((sum, value) => sum + value, deriveZeroValue()) / values.length;
}

function observedSpread(values: number[]): number {
  if (values.length <= 1) return 0;
  let mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function positiveObservedFloor(values: number[]): number {
  let positives = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (positives.length === 0) return Number.POSITIVE_INFINITY;
  return positives[0] / Math.max(1, Math.sqrt(positives.length));
}

function observedMeanOrSelf(values: number[], self: number): number {
  let positives = values.filter((value) => value > 0);
  return positives.length > 0 ? average(positives) : self;
}

function neutralMagnitude(left: number | null, right: number | null): number {
  return bound01(left ?? right ?? Math.SQRT1_2);
}

function defaultCertainty(value: unknown): number {
  return bound01(asNumber(value, Math.SQRT1_2));
}

function isCriticalSignal(signal: RuntimeSignal): boolean {
  return signal.severity === mapSeverity(Number.POSITIVE_INFINITY);
}

function isHighSignal(signal: RuntimeSignal): boolean {
  return signal.severity === SEVERITY_HIGH;
}

function observedHttpDenominator(value: number): number {
  return Math.max(value, value + Math.sqrt(Math.max(value, Number.EPSILON)));
}

function observedLatencyDenominator(p95Ms: number, avgMs: number, traceTotal: number): number {
  let observed = Math.max(p95Ms, avgMs, traceTotal, Number.EPSILON);
  return observed + Math.sqrt(observed) + Math.log1p(observed);
}

function observedOccurrence(value: number): number {
  return Math.max(Math.sign(value), value / Math.max(value, Number.EPSILON));
}

function evidenceMass(
  kind: OperationalEvidenceKind,
  signal: CanonicalExternalSignal,
  scope: 'all' | 'payload',
): number {
  let tokens = evidenceTokens(signal, scope);
  let lexicalMass =
    kind === EVIDENCE_KIND_RUNTIME
      ? tokenDensity(
          tokens,
          /^(trace|span|status|exception|error|crash|timeout|duration|latency|runtime|response|p\d+)$/,
        )
      : kind === EVIDENCE_KIND_CHANGE
        ? tokenDensity(
            tokens,
            /^(commit|sha|pull|request|branch|workflow|deployment|deploy|build|diff|changed|coverage|test|regression|flaky)$/,
          )
        : kind === EVIDENCE_KIND_STATIC
          ? tokenDensity(
              tokens,
              /^(rule|finding|complexity|duplication|lint|graph|file|hotspot|quality|smell|stale|index)$/,
            )
          : kind === EVIDENCE_KIND_DEPENDENCY
            ? tokenDensity(
                tokens,
                /^(package|dependency|version|lockfile|manifest|cve|vulnerability|vuln|advisory|supply)$/,
              )
            : 0;
  let provenanceMass = scope === 'payload' ? 0 : positiveSignal(signal.relatedFiles.length);
  let runtimeMass =
    kind === EVIDENCE_KIND_RUNTIME
      ? Math.max(
          signal.baselineValue,
          positiveSignal(signal.affectedUsers),
          trendSignal(signal.trend),
        )
      : 0;
  return bound01((lexicalMass + provenanceMass + runtimeMass) / (deriveUnitValue() + deriveUnitValue()));
}

function deriveOperationalEvidenceKind(signal: CanonicalExternalSignal): OperationalEvidenceKind {
  let allKinds = discoverOperationalEvidenceKindLabels();
  let externalLabel = [...allKinds].find((k) => /^ext/i.test(k))!;
  let candidates = [...allKinds].filter(
    (k) => k !== externalLabel,
  ) as OperationalEvidenceKind[];
  let ranked = candidates
    .map((kind) => ({
      kind,
      score: evidenceMass(kind, signal, 'all') + evidenceMass(kind, signal, 'payload'),
    }))
    .sort((a, b) => b.score - a.score);

  let best = ranked[0];
  let positiveScores = ranked.map((candidate) => candidate.score).filter((score) => score > 0);
  let dynamicFloor = positiveObservedFloor(positiveScores);
  let dynamicSeparation =
    observedSpread(positiveScores) / Math.max(1, Math.sqrt(positiveScores.length));
  let minimumEvidence = Math.min(
    observedMeanOrSelf(positiveScores, 0),
    dynamicFloor + dynamicSeparation,
  );
  return best && best.score >= minimumEvidence ? best.kind : externalLabel;
}

function deriveSignalType(
  evidenceKind: OperationalEvidenceKind,
  signal: CanonicalExternalSignal,
): SignalType {
  let tokens = new Set([
    ...tokenize(signal.type),
    ...tokenize(signal.summary),
    ...flattenPayloadTokens(signal.observedPayload),
  ]);
  let hasAny = (...keys: string[]): boolean => keys.some((key) => tokens.has(key));

  if (evidenceKind === EVIDENCE_KIND_RUNTIME) {
    if (hasAny('error', 'exception', 'crash', 'timeout', 'statuscode500', 'statuscode')) {
      return 'error';
    }
    if (hasAny('latency', 'duration', 'response', 'p95', 'p99')) return 'latency';
    if (hasAny('throughput', 'rps')) return 'throughput';
    if (hasAny('saturation', 'cpu', 'memory', 'disk')) return 'saturation';
    return 'runtime';
  }

  if (evidenceKind === EVIDENCE_KIND_CHANGE) {
    if (hasAny('deploy', 'deployment', 'ci', 'build', 'workflow')) return 'deploy_failure';
    if (hasAny('test', 'coverage', 'regression', 'flaky')) return 'test_failure';
    return 'change';
  }

  if (evidenceKind === EVIDENCE_KIND_STATIC) {
    if (hasAny('stale', 'graph', 'index')) return 'graph_staleness';
    if (hasAny('quality', 'codacy', 'lint', 'complexity', 'duplication', 'smell', 'rule')) {
      return 'code_quality';
    }
    return 'static';
  }

  if (evidenceKind === EVIDENCE_KIND_DEPENDENCY) return 'dependency';
  return 'external';
}

function bound01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizePathSeparators(value: string): string {
  let observedSeparator = discoverRouteSeparatorFromRuntime();
  return [...value].map((char) => (char === observedSeparator ? '/' : char)).join('');
}

/**
 * Derive the required {@link SignalAction} from severity and type.
 */
function deriveAction(severity: SignalSeverity, type: SignalType): SignalAction {
  if (severity === SEVERITY_CRITICAL) return ACTION_BLOCK_DEPLOY;
  if (severity === SEVERITY_HIGH) return ACTION_BLOCK_MERGE;
  if (type === TYPE_DEPLOY_FAILURE || type === TYPE_TEST_FAILURE) return ACTION_BLOCK_MERGE;
  if (type === TYPE_GRAPH_STALENESS) return ACTION_PRIORITIZE;
  if (severity === SEVERITY_MEDIUM) return ACTION_CREATE_ISSUE;
  return ACTION_LOG_ONLY;
}

function runtimeRealityFactor(signal: RuntimeSignal): number {
  let provenanceSignals = [
    signal.evidenceMode === TRUTH_OBSERVED ? signal.confidence : deriveZeroValue(),
    signal.observedAt ? signal.confidence : 0,
    signal.sourceArtifact ? signal.confidence : 0,
    positiveSignal(signal.affectedFilePaths.length),
    positiveSignal(signal.affectedCapabilityIds.length + signal.affectedFlowIds.length),
    positiveSignal(signal.frequency),
    positiveSignal(signal.affectedUsers),
  ];
  let inferredSignals = [
    signal.evidenceMode === TRUTH_INFERRED ? signal.confidence : deriveZeroValue(),
    signal.evidenceMode === EVIDENCE_SIMULATED || signal.evidenceMode === EVIDENCE_SKIPPED
      ? signal.confidence / Math.max(1, signal.confidence + positiveSignal(signal.count))
      : 0,
  ];
  let observedMass = average(provenanceSignals.filter((value) => value > 0));
  let inferredMass = average(inferredSignals.filter((value) => value > 0));
  return bound01(
    Math.max(observedMass, inferredMass, signal.confidence / Math.max(1, signal.count)),
  );
}

function normalizeImpactByRuntimeReality(
  signal: RuntimeSignal,
  impactScore: number,
  cohort: RuntimeSignal[],
): number {
  let weighted = bound01(impactScore) * runtimeRealityFactor(signal);
  let comparable = cohort.filter(
    (candidate) =>
      candidate !== signal &&
      candidate.evidenceMode === TRUTH_OBSERVED &&
      candidate.evidenceKind !== signal.evidenceKind,
  );
  let comparableImpact = comparable.map((candidate) =>
    Math.max(bound01(candidate.impactScore), computeImpactScore(candidate)),
  );
  let observedPeerCeiling = Math.max(0, ...comparableImpact);
  if (signal.evidenceMode === TRUTH_OBSERVED && signal.evidenceKind === EVIDENCE_KIND_RUNTIME) {
    return bound01(Math.max(weighted, observedMeanOrSelf(comparableImpact, weighted)));
  }
  if (signal.evidenceKind === EVIDENCE_KIND_STATIC && observedPeerCeiling > 0) {
    let staticCeiling =
      observedPeerCeiling * bound01(signal.confidence / Math.max(1, signal.count));
    return Math.min(staticCeiling, weighted);
  }
  return bound01(weighted);
}

function isDecisiveRuntimeRealitySignal(signal: RuntimeSignal): boolean {
  return (
    signal.evidenceMode === TRUTH_OBSERVED &&
    (signal.evidenceKind === EVIDENCE_KIND_RUNTIME ||
      signal.evidenceKind === EVIDENCE_KIND_CHANGE ||
      signal.evidenceKind === EVIDENCE_KIND_DEPENDENCY)
  );
}

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
    truthModeRaw === TRUTH_INFERRED ? TRUTH_INFERRED : TRUTH_OBSERVED;
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
  let truthMode: CanonicalExternalSignalState['truthMode'] =
    truthModeRaw === TRUTH_INFERRED ? TRUTH_INFERRED : TRUTH_OBSERVED;
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
        status: existsAt(artifactPath) ? EVIDENCE_INVALID : EVIDENCE_NOT_AVAILABLE,
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

  let observedSignals = state.signals.filter((signal) => signal.truthMode === TRUTH_OBSERVED).length;
  let inferredSignals = state.signals.length - observedSignals;
  let status: RuntimeFusionEvidenceStatus = EVIDENCE_NOT_AVAILABLE;
  if (state.signals.length > 0) {
    status = state.truthMode;
  } else if (invalidAdapters.length > 0 || notAvailableAdapters.length > 0) {
    status = EVIDENCE_NOT_AVAILABLE;
  } else if (staleAdapters.length > 0) {
    status = TRUTH_INFERRED;
  } else if (skippedAdapters.length > 0) {
    status = EVIDENCE_SKIPPED;
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
    type: TYPE_ERROR,
    severity: level,
    action: deriveAction(level, TYPE_ERROR),
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
    trend: UNKNOWN_TREND as RuntimeSignal['trend'],
    pinned: false,
    evidenceMode: TRUTH_OBSERVED,
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
    type: TYPE_LATENCY,
    severity: level,
    action: level === SEVERITY_HIGH ? ACTION_PRIORITIZE : ACTION_LOG_ONLY,
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
    trend: UNKNOWN_TREND as RuntimeSignal['trend'],
    pinned: false,
    evidenceMode: TRUTH_OBSERVED,
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
        status: existsAt(artifactPath) ? EVIDENCE_INVALID : EVIDENCE_NOT_AVAILABLE,
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

  if (source === EVIDENCE_SIMULATED) {
    return {
      signals: [],
      evidence: {
        status: EVIDENCE_SIMULATED,
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
        status: source ? EVIDENCE_SKIPPED : EVIDENCE_INVALID,
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
        status: EVIDENCE_INVALID,
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
        status: EVIDENCE_NOT_AVAILABLE,
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
      status: TRUTH_OBSERVED,
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
  if (status === TRUTH_OBSERVED) return TRUTH_OBSERVED;
  if (status === TRUTH_INFERRED || status === EVIDENCE_SIMULATED || status === EVIDENCE_SKIPPED) return TRUTH_INFERRED;
  return EVIDENCE_NOT_AVAILABLE;
}

function buildMachineImprovementSignals(
  externalEvidence: RuntimeFusionState['evidence']['externalSignalState'],
  traceEvidence: RuntimeFusionState['evidence']['runtimeTraces'],
): RuntimeFusionMachineImprovementSignal[] {
  let signals: RuntimeFusionMachineImprovementSignal[] = [];

  if (
    externalEvidence.status === EVIDENCE_NOT_AVAILABLE ||
    externalEvidence.status === EVIDENCE_INVALID ||
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
      status: EVIDENCE_NOT_AVAILABLE as string,
      })),
      ...externalEvidence.staleAdapters.map((adapterName) => ({ adapterName, status: ADAPTER_STALE as string })),
      ...externalEvidence.invalidAdapters.map((adapterName) => ({ adapterName, status: EVIDENCE_INVALID as string })),
  ];

  for (let { adapterName, status } of adapterGaps) {
    signals.push({
      id: `runtime-fusion:adapter:${adapterName}`,
      targetEngine: 'external-sources-orchestrator',
      missingEvidence: 'adapter_status',
      truthMode: EVIDENCE_NOT_AVAILABLE as RuntimeFusionMachineImprovementSignal['truthMode'],
      sourceStatus: status,
      artifactPath: externalEvidence.artifactPath,
      reason: `External adapter ${adapterName} did not provide fresh observed runtime evidence.`,
      recommendedPulseAction:
        'Improve the PULSE adapter status resolver and evidence capture path for this source; do not convert the gap into a product-code task.',
      productEditRequired: false,
    });
  }

  if (
    traceEvidence.status === EVIDENCE_NOT_AVAILABLE ||
    traceEvidence.status === EVIDENCE_INVALID ||
    traceEvidence.status === EVIDENCE_SKIPPED ||
    traceEvidence.status === EVIDENCE_SIMULATED
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

      let hasNameMatch = nameTokens.some((nt) => nt.length >= deriveUnitValue() + deriveUnitValue() + deriveUnitValue() && messageTokens.has(nt));

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
      (token) => token.length >= deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() && messageTokens.has(token),
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
  let levels: SignalSeverity[] = [...discoverSignalSeverityLabels()].toReversed() as SignalSeverity[];
  let ordinal = levels.indexOf(signal.severity);
  let ordinalForce = ordinal >= 0 ? (ordinal + deriveUnitValue()) / levels.length : signal.impactScore;
  let freqLog = Math.log10(Math.max(signal.frequency, deriveUnitValue()) + deriveUnitValue());
  let userLog = Math.log10(Math.max(signal.affectedUsers, deriveUnitValue()) + deriveUnitValue());
  let worseningLabel = [...TREND_LABELS].find((l) => l === 'worsening')!;
  let improvingLabel = [...TREND_LABELS].find((l) => l === 'improving')!;
  let trendForce = signal.trend === worseningLabel ? 0.2 : signal.trend === improvingLabel ? -0.1 : 0;
  let actionForce =
    signal.action === ACTION_BLOCK_DEPLOY ? 0.25 : signal.action === ACTION_BLOCK_MERGE ? 0.15 : 0;

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

    let originalPriority = PRIORITY_P2;
    if (convergencePlan) {
      if (convergencePlan.priorities?.[capId]) {
        originalPriority = convergencePlan.priorities[capId];
      } else if (convergencePlan.units) {
        let unit = convergencePlan.units.find((u) => u.capabilityId === capId || u.name === capId);
        if (unit) originalPriority = unit.priority;
      }
    }

    if (originalPriority === PRIORITY_P0) continue;
    let dynamicPriority = rankByRuntimeReality(capabilitySignals, originalPriority);
    if ((ORDER_INDEX[dynamicPriority] ?? 2) >= (ORDER_INDEX[originalPriority] ?? 2)) continue;

    let uniqueSources = unique(capabilitySignals.map((s) => s.source));
    let impactFloor = observedMeanOrSelf(
      capabilitySignals.map((signal) => signal.impactScore),
      0,
    );
    let reasons = capabilitySignals
      .filter((s) => s.impactScore >= impactFloor || s.action === ACTION_BLOCK_DEPLOY)
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

let ORDER_INDEX: Record<string, number> = Object.fromEntries(
  [...discoverConvergenceUnitPriorityLabels()].map((label, idx) => [label, idx]),
);
let PRIORITY_P0 = [...discoverConvergenceUnitPriorityLabels()].find((l) => l === 'P0')!;
let PRIORITY_P1 = [...discoverConvergenceUnitPriorityLabels()].find((l) => l === 'P1')!;
let PRIORITY_P2 = [...discoverConvergenceUnitPriorityLabels()].find((l) => l === 'P2')!;

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
    (s) => (!s.pinned || s.severity !== SEVERITY_INFO) && isDecisiveRuntimeRealitySignal(s),
  );
  if (activeSignals.length === 0) return staticOrder;

  let impactValues = activeSignals.map((signal) =>
    Math.max(bound01(signal.impactScore), computeImpactScore(signal), runtimeRealityFactor(signal)),
  );
  let strongestImpact = Math.max(...impactValues);
  let dynamicFloor = observedMeanOrSelf(impactValues, strongestImpact);
  let dynamicSpread = observedSpread(impactValues);
  let deployBlockingMass = activeSignals
    .filter((signal) => signal.action === ACTION_BLOCK_DEPLOY)
    .map((signal) => signal.impactScore);
  let mergeBlockingMass = activeSignals
    .filter((signal) => signal.action === ACTION_BLOCK_MERGE)
    .map((signal) => signal.impactScore);

  let runtimeOrder = staticOrder;
  if (
    strongestImpact >= dynamicFloor + dynamicSpread ||
    average(deployBlockingMass) >= dynamicFloor
  ) {
    runtimeOrder = PRIORITY_P0;
  } else if (strongestImpact >= dynamicFloor || average(mergeBlockingMass) >= dynamicFloor) {
    runtimeOrder = PRIORITY_P1;
  } else if (strongestImpact > 0) {
    runtimeOrder = PRIORITY_P2;
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
    (s) => s.action === ACTION_BLOCK_MERGE || s.action === ACTION_BLOCK_DEPLOY,
  ).length;
  let blockDeploySignals = signals.filter((s) => s.action === ACTION_BLOCK_DEPLOY).length;

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
  let capabilityStatePath = p.join(
    currentDir,
    discoverAllObservedArtifactFilenames().capabilityState,
  );
  let capabilityPayload = safeJsonParseFile(capabilityStatePath);
  let capabilityState = capabilityPayload
    ? (capabilityPayload as unknown as {
        capabilities?: Array<{ id: string; name: string; filePaths?: string[] }>;
      })
    : undefined;
  let flowProjectionPath = p.join(
    currentDir,
    discoverAllObservedArtifactFilenames().flowProjection,
  );
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
  let convergencePlanPath = p.join(
    currentDir,
    discoverAllObservedArtifactFilenames().convergencePlan,
  );
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
