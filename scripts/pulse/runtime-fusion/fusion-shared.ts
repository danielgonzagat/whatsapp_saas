import { tokenize, unique } from '../signal-normalizers';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { discoverExternalAdapterStatusLabels } from '../__kernel_additions__/discoverExternalAdapterStatusLabels';
import {
  discoverOperationalEvidenceKindLabels,
  discoverRuntimeFusionEvidenceStatusLabels,
  discoverSignalActionLabels,
  discoverSignalSeverityLabels,
  discoverSignalTypeLabels,
  discoverTruthModeLabels,
} from '../dynamic-reality-kernel/type-contract-engines';
import {
  discoverRouteSeparatorFromRuntime,
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import type {
  OperationalEvidenceKind,
  RuntimeSignal,
  SignalAction,
  SignalSeverity,
  SignalType,
  RuntimeFusionEvidenceStatus,
  RuntimeSignalEvidenceMode,
} from '../types.runtime-fusion';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanonicalExternalSignal {
  id: string;
  source: string;
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

// ─── Low-level utilities from parsing ────────────────────────────────────────

export function asNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// ─── Trend labels ────────────────────────────────────────────────────────────

export let TREND_LABELS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.runtime-fusion.ts',
  'trend',
);
export let UNKNOWN_TREND = [...TREND_LABELS].find((l) => l === 'unknown') || 'unknown';
export let TREND_WORSENING = [...TREND_LABELS].find((l) => l === 'worsening')!;
export let TREND_IMPROVING = [...TREND_LABELS].find((l) => l === 'improving')!;

// ─── Constants ───────────────────────────────────────────────────────────────

export let EXTERNAL_SIGNAL_STATE_FILE = discoverAllObservedArtifactFilenames().externalSignalState;
export let RUNTIME_TRACES_FILE = discoverAllObservedArtifactFilenames().runtimeTraces;
export let FUSION_OUTPUT_FILE = discoverAllObservedArtifactFilenames().runtimeFusion;

export let DYNAMIC_SIGNAL_SEMANTICS_NOTE = `Dynamic signal semantics derived from ${discoverAllObservedArtifactFilenames().externalSignalState} source capability, observed payload, runtime baseline, trend, impact, and blast-radius hints; legacy labels are weak calibration only.`;

let EVIDENCE_STATUS_LABELS = discoverRuntimeFusionEvidenceStatusLabels();
export let EVIDENCE_NOT_AVAILABLE: RuntimeFusionEvidenceStatus = [...EVIDENCE_STATUS_LABELS].find(
  (l) => /^not.?avail/i.test(l),
)! as RuntimeFusionEvidenceStatus;
export let EVIDENCE_INVALID: RuntimeFusionEvidenceStatus = [...EVIDENCE_STATUS_LABELS].find((l) =>
  /invalid/i.test(l),
)! as RuntimeFusionEvidenceStatus;
export let EVIDENCE_SKIPPED: RuntimeFusionEvidenceStatus = [...EVIDENCE_STATUS_LABELS].find((l) =>
  /skip/i.test(l),
)! as RuntimeFusionEvidenceStatus;
export let EVIDENCE_SIMULATED: RuntimeFusionEvidenceStatus = [...EVIDENCE_STATUS_LABELS].find((l) =>
  /simul/i.test(l),
)! as RuntimeFusionEvidenceStatus;

let TRUTH_LABELS = discoverTruthModeLabels();
export let TRUTH_OBSERVED: RuntimeSignalEvidenceMode = [...TRUTH_LABELS].find((l) =>
  /^observ/i.test(l),
)! as RuntimeSignalEvidenceMode;
export let TRUTH_INFERRED: RuntimeSignalEvidenceMode = [...TRUTH_LABELS].find((l) =>
  /^infer/i.test(l),
)! as RuntimeSignalEvidenceMode;

let SEVERITY_LABELS = discoverSignalSeverityLabels();
export let SEVERITY_CRITICAL: SignalSeverity = [...SEVERITY_LABELS].find((l) =>
  /^crit/i.test(l),
)! as SignalSeverity;
export let SEVERITY_HIGH: SignalSeverity = [...SEVERITY_LABELS].find((l) =>
  /^high/i.test(l),
)! as SignalSeverity;
export let SEVERITY_MEDIUM: SignalSeverity = [...SEVERITY_LABELS].find((l) =>
  /^med/i.test(l),
)! as SignalSeverity;
export let SEVERITY_LOW: SignalSeverity = [...SEVERITY_LABELS].find((l) =>
  /^low/i.test(l),
)! as SignalSeverity;
export let SEVERITY_INFO: SignalSeverity = [...SEVERITY_LABELS].find((l) =>
  /^info/i.test(l),
)! as SignalSeverity;

let ACTION_LABELS = discoverSignalActionLabels();
export let ACTION_BLOCK_DEPLOY: SignalAction = [...ACTION_LABELS].find((l) =>
  /deploy/i.test(l),
)! as SignalAction;
export let ACTION_BLOCK_MERGE: SignalAction = [...ACTION_LABELS].find((l) =>
  /merge/i.test(l),
)! as SignalAction;
export let ACTION_PRIORITIZE: SignalAction = [...ACTION_LABELS].find((l) =>
  /priorit/i.test(l),
)! as SignalAction;
export let ACTION_CREATE_ISSUE: SignalAction = [...ACTION_LABELS].find((l) =>
  /issue/i.test(l),
)! as SignalAction;
export let ACTION_LOG_ONLY: SignalAction = [...ACTION_LABELS].find((l) =>
  /log/i.test(l),
)! as SignalAction;

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

export function mapSeverity(value: number): SignalSeverity {
  if (value >= 0.9) return SEVERITY_CRITICAL;
  if (value >= 0.7) return SEVERITY_HIGH;
  if (value >= 0.4) return SEVERITY_MEDIUM;
  if (value >= 0.2) return SEVERITY_LOW;
  return SEVERITY_INFO;
}

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
  return best && best.score >= minimumEvidence
    ? best.kind
    : (externalLabel as OperationalEvidenceKind);
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

export function deriveAction(severity: SignalSeverity, type: SignalType): SignalAction {
  if (severity === SEVERITY_CRITICAL) return ACTION_BLOCK_DEPLOY;
  if (severity === SEVERITY_HIGH) return ACTION_BLOCK_MERGE;
  if (type === TYPE_DEPLOY_FAILURE || type === TYPE_TEST_FAILURE) return ACTION_BLOCK_MERGE;
  if (type === TYPE_GRAPH_STALENESS) return ACTION_PRIORITIZE;
  if (severity === SEVERITY_MEDIUM) return ACTION_CREATE_ISSUE;
  return ACTION_LOG_ONLY;
}

// ─── Impact Score Computation (from mapping) ─────────────────────────────────

export function computeImpactScore(signal: RuntimeSignal): number {
  return deriveMagnitude(signal);
}

function deriveMagnitude(signal: RuntimeSignal): number {
  let levels: SignalSeverity[] = [...discoverSignalSeverityLabels()]
    .slice()
    .reverse() as SignalSeverity[];
  let ordinal = levels.indexOf(signal.severity);
  let ordinalForce =
    ordinal >= 0 ? (ordinal + deriveUnitValue()) / levels.length : signal.impactScore;
  let freqLog = Math.log10(Math.max(signal.frequency, deriveUnitValue()) + deriveUnitValue());
  let userLog = Math.log10(Math.max(signal.affectedUsers, deriveUnitValue()) + deriveUnitValue());
  let worseningLabel = [...TREND_LABELS].find((l) => l === 'worsening')!;
  let improvingLabel = [...TREND_LABELS].find((l) => l === 'improving')!;
  let trendForce =
    signal.trend === worseningLabel ? 0.2 : signal.trend === improvingLabel ? -0.1 : 0;
  let actionForce =
    signal.action === ACTION_BLOCK_DEPLOY ? 0.25 : signal.action === ACTION_BLOCK_MERGE ? 0.15 : 0;

  let observedMagnitude = (freqLog + userLog) / Math.max(freqLog + userLog, 12);
  let raw = observedMagnitude + ordinalForce * 0.2 + trendForce + actionForce;

  return bound01(raw);
}
