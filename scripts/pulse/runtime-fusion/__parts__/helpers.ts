import { tokenize, unique } from '../../signal-normalizers';
import {
  discoverAllObservedArtifactFilenames,
  discoverExternalAdapterStatusLabels,
  discoverOperationalEvidenceKindLabels,
  discoverRouteSeparatorFromRuntime,
  discoverRuntimeFusionEvidenceStatusLabels,
  discoverSignalActionLabels,
  discoverSignalSeverityLabels,
  discoverSignalSourceLabels,
  discoverSignalTypeLabels,
  discoverTruthModeLabels,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';
import type { CanonicalExternalSignal } from './parsing';
import { TREND_LABELS, isRecord, asNumber } from './parsing';
import { computeImpactScore } from './mapping';
import type {
  OperationalEvidenceKind,
  RuntimeSignal,
  SignalAction,
  SignalSeverity,
  SignalType,
} from '../../types.runtime-fusion';

// ─── Constants ───────────────────────────────────────────────────────────────

export let EXTERNAL_SIGNAL_STATE_FILE = discoverAllObservedArtifactFilenames().externalSignalState;
export let RUNTIME_TRACES_FILE = discoverAllObservedArtifactFilenames().runtimeTraces;
export let FUSION_OUTPUT_FILE = discoverAllObservedArtifactFilenames().runtimeFusion;

export let DYNAMIC_SIGNAL_SEMANTICS_NOTE = `Dynamic signal semantics derived from ${discoverAllObservedArtifactFilenames().externalSignalState} source capability, observed payload, runtime baseline, trend, impact, and blast-radius hints; legacy labels are weak calibration only.`;

let EVIDENCE_STATUS_LABELS = discoverRuntimeFusionEvidenceStatusLabels();
export let EVIDENCE_NOT_AVAILABLE = [...EVIDENCE_STATUS_LABELS].find((l) =>
  /^not.?avail/i.test(l),
)!;
export let EVIDENCE_INVALID = [...EVIDENCE_STATUS_LABELS].find((l) => /invalid/i.test(l))!;
export let EVIDENCE_SKIPPED = [...EVIDENCE_STATUS_LABELS].find((l) => /skip/i.test(l))!;
export let EVIDENCE_SIMULATED = [...EVIDENCE_STATUS_LABELS].find((l) => /simul/i.test(l))!;

let TRUTH_LABELS = discoverTruthModeLabels();
export let TRUTH_OBSERVED = [...TRUTH_LABELS].find((l) => /^observ/i.test(l))!;
export let TRUTH_INFERRED = [...TRUTH_LABELS].find((l) => /^infer/i.test(l))!;

let SEVERITY_LABELS = discoverSignalSeverityLabels();
export let SEVERITY_CRITICAL = [...SEVERITY_LABELS].find((l) => /^crit/i.test(l))!;
export let SEVERITY_HIGH = [...SEVERITY_LABELS].find((l) => /^high/i.test(l))!;
export let SEVERITY_MEDIUM = [...SEVERITY_LABELS].find((l) => /^med/i.test(l))!;
export let SEVERITY_LOW = [...SEVERITY_LABELS].find((l) => /^low/i.test(l))!;
export let SEVERITY_INFO = [...SEVERITY_LABELS].find((l) => /^info/i.test(l))!;

let ACTION_LABELS = discoverSignalActionLabels();
export let ACTION_BLOCK_DEPLOY = [...ACTION_LABELS].find((l) => /deploy/i.test(l))!;
export let ACTION_BLOCK_MERGE = [...ACTION_LABELS].find((l) => /merge/i.test(l))!;
export let ACTION_PRIORITIZE = [...ACTION_LABELS].find((l) => /priorit/i.test(l))!;
export let ACTION_CREATE_ISSUE = [...ACTION_LABELS].find((l) => /issue/i.test(l))!;
export let ACTION_LOG_ONLY = [...ACTION_LABELS].find((l) => /log/i.test(l))!;

let TYPE_LABELS = discoverSignalTypeLabels();
export let TYPE_DEPLOY_FAILURE = [...TYPE_LABELS].find((l) => /deploy_fail/i.test(l))!;
export let TYPE_TEST_FAILURE = [...TYPE_LABELS].find((l) => /test_fail/i.test(l))!;
export let TYPE_GRAPH_STALENESS = [...TYPE_LABELS].find((l) => /graph_stale/i.test(l))!;
export let TYPE_ERROR = [...TYPE_LABELS].find((l) => l === 'error')!;
export let TYPE_LATENCY = [...TYPE_LABELS].find((l) => l === 'latency')!;

let EVIDENCE_KIND_LABELS = discoverOperationalEvidenceKindLabels();
export let EVIDENCE_KIND_RUNTIME = [...EVIDENCE_KIND_LABELS].find((l) => l === 'runtime')!;
export let EVIDENCE_KIND_CHANGE = [...EVIDENCE_KIND_LABELS].find((l) => l === 'change')!;
export let EVIDENCE_KIND_STATIC = [...EVIDENCE_KIND_LABELS].find((l) => l === 'static')!;
export let EVIDENCE_KIND_DEPENDENCY = [...EVIDENCE_KIND_LABELS].find((l) => l === 'dependency')!;
export let EVIDENCE_KIND_EXTERNAL = [...EVIDENCE_KIND_LABELS].find((l) => /^ext/i.test(l))!;

export let ADAPTER_STALE = [...discoverExternalAdapterStatusLabels()].find((l) => l === 'stale')!;

// ─── Numeric → Categorical Mapping ──────────────────────────────────────────

/**
 * Map a numeric severity score (0..1) to a categorical {@link SignalSeverity}.
 */
export function mapSeverity(value: number): SignalSeverity {
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
export function tokenizeEvidenceTerm(value: string): string[] {
  let expanded = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_./:-]+/g, ' ');
  return unique([...tokenize(value), ...tokenize(expanded)]);
}

export function flattenPayloadTokens(value: unknown): string[] {
  if (typeof value === 'string') return tokenizeEvidenceTerm(value);
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPayloadTokens);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...tokenizeEvidenceTerm(key),
    ...flattenPayloadTokens(entry),
  ]);
}

export function evidenceTokens(
  signal: CanonicalExternalSignal,
  scope: 'all' | 'payload',
): Set<string> {
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

export function tokenDensity(tokens: Set<string>, pattern: RegExp): number {
  let hits = [...tokens].filter((token) => pattern.test(token)).length;
  if (hits === 0) return 0;
  return bound01(hits / Math.max(1, Math.sqrt(tokens.size)));
}

export function positiveSignal(value: number): number {
  return value > 0 ? bound01(Math.log10(value + 1)) : 0;
}

export function trendSignal(trend: RuntimeSignal['trend']): number {
  let worse = [...TREND_LABELS].find((l) => /wors/i.test(l))!;
  let better = [...TREND_LABELS].find((l) => /impr/i.test(l))!;
  if (trend === worse) return deriveUnitValue();
  if (trend === better)
    return (
      -(deriveUnitValue() + deriveUnitValue()) /
      (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue())
    );
  return deriveZeroValue();
}

export function observedInfluence(signal: CanonicalExternalSignal): number {
  return bound01(signal.impactScore / Math.max(signal.impactScore, signal.severity, 1));
}

export function average(values: number[]): number {
  if (values.length === deriveZeroValue()) return deriveZeroValue();
  return values.reduce((sum, value) => sum + value, deriveZeroValue()) / values.length;
}

export function observedSpread(values: number[]): number {
  if (values.length <= 1) return 0;
  let mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

export function positiveObservedFloor(values: number[]): number {
  let positives = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (positives.length === 0) return Number.POSITIVE_INFINITY;
  return positives[0] / Math.max(1, Math.sqrt(positives.length));
}

export function observedMeanOrSelf(values: number[], self: number): number {
  let positives = values.filter((value) => value > 0);
  return positives.length > 0 ? average(positives) : self;
}

export function neutralMagnitude(left: number | null, right: number | null): number {
  return bound01(left ?? right ?? Math.SQRT1_2);
}

export function defaultCertainty(value: unknown): number {
  return bound01(asNumber(value, Math.SQRT1_2));
}

export function isCriticalSignal(signal: RuntimeSignal): boolean {
  return signal.severity === mapSeverity(Number.POSITIVE_INFINITY);
}

export function isHighSignal(signal: RuntimeSignal): boolean {
  return signal.severity === SEVERITY_HIGH;
}

export function observedHttpDenominator(value: number): number {
  return Math.max(value, value + Math.sqrt(Math.max(value, Number.EPSILON)));
}

export function observedLatencyDenominator(
  p95Ms: number,
  avgMs: number,
  traceTotal: number,
): number {
  let observed = Math.max(p95Ms, avgMs, traceTotal, Number.EPSILON);
  return observed + Math.sqrt(observed) + Math.log1p(observed);
}

export function observedOccurrence(value: number): number {
  return Math.max(Math.sign(value), value / Math.max(value, Number.EPSILON));
}

export function evidenceMass(
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
  return bound01(
    (lexicalMass + provenanceMass + runtimeMass) / (deriveUnitValue() + deriveUnitValue()),
  );
}

export function deriveOperationalEvidenceKind(
  signal: CanonicalExternalSignal,
): OperationalEvidenceKind {
  let allKinds = discoverOperationalEvidenceKindLabels();
  let externalLabel = [...allKinds].find((k) => /^ext/i.test(k))!;
  let candidates = [...allKinds].filter((k) => k !== externalLabel) as OperationalEvidenceKind[];
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

export function deriveSignalType(
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

export function bound01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizePathSeparators(value: string): string {
  let observedSeparator = discoverRouteSeparatorFromRuntime();
  return [...value].map((char) => (char === observedSeparator ? '/' : char)).join('');
}

/**
 * Derive the required {@link SignalAction} from severity and type.
 */
export function deriveAction(severity: SignalSeverity, type: SignalType): SignalAction {
  if (severity === SEVERITY_CRITICAL) return ACTION_BLOCK_DEPLOY;
  if (severity === SEVERITY_HIGH) return ACTION_BLOCK_MERGE;
  if (type === TYPE_DEPLOY_FAILURE || type === TYPE_TEST_FAILURE) return ACTION_BLOCK_MERGE;
  if (type === TYPE_GRAPH_STALENESS) return ACTION_PRIORITIZE;
  if (severity === SEVERITY_MEDIUM) return ACTION_CREATE_ISSUE;
  return ACTION_LOG_ONLY;
}

export function runtimeRealityFactor(signal: RuntimeSignal): number {
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

export function normalizeImpactByRuntimeReality(
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

export function isDecisiveRuntimeRealitySignal(signal: RuntimeSignal): boolean {
  return (
    signal.evidenceMode === TRUTH_OBSERVED &&
    (signal.evidenceKind === EVIDENCE_KIND_RUNTIME ||
      signal.evidenceKind === EVIDENCE_KIND_CHANGE ||
      signal.evidenceKind === EVIDENCE_KIND_DEPENDENCY)
  );
}
