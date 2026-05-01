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

let EXTERNAL_SIGNAL_STATE_FILE = 'PULSE_EXTERNAL_SIGNAL_STATE.json';
let RUNTIME_TRACES_FILE = 'PULSE_RUNTIME_TRACES.json';
let FUSION_OUTPUT_FILE = 'PULSE_RUNTIME_FUSION.json';

let DYNAMIC_SIGNAL_SEMANTICS_NOTE =
  'Dynamic signal semantics derived from source capability, observed payload, runtime baseline, trend, impact, and blast-radius hints; legacy labels are weak calibration only.';

// ─── Numeric → Categorical Mapping ──────────────────────────────────────────

/**
 * Map a numeric severity score (0..1) to a categorical {@link SignalSeverity}.
 */
function mapSeverity(value: number): SignalSeverity {
  if (value >= 0.9) return 'critical';
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  if (value >= 0.2) return 'low';
  return 'info';
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
  if (trend === 'worsening') return 1;
  if (trend === 'improving') return -0.5;
  return 0;
}

function observedInfluence(signal: CanonicalExternalSignal): number {
  return bound01(signal.impactScore / Math.max(signal.impactScore, signal.severity, 1));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  return signal.severity === 'high';
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
    kind === 'runtime'
      ? tokenDensity(
          tokens,
          /^(trace|span|status|exception|error|crash|timeout|duration|latency|runtime|response|p\d+)$/,
        )
      : kind === 'change'
        ? tokenDensity(
            tokens,
            /^(commit|sha|pull|request|branch|workflow|deployment|deploy|build|diff|changed|coverage|test|regression|flaky)$/,
          )
        : kind === 'static'
          ? tokenDensity(
              tokens,
              /^(rule|finding|complexity|duplication|lint|graph|file|hotspot|quality|smell|stale|index)$/,
            )
          : kind === 'dependency'
            ? tokenDensity(
                tokens,
                /^(package|dependency|version|lockfile|manifest|cve|vulnerability|vuln|advisory|supply)$/,
              )
            : 0;
  let provenanceMass = scope === 'payload' ? 0 : positiveSignal(signal.relatedFiles.length);
  let runtimeMass =
    kind === 'runtime'
      ? Math.max(
          signal.baselineValue,
          positiveSignal(signal.affectedUsers),
          trendSignal(signal.trend),
        )
      : 0;
  return bound01((lexicalMass + provenanceMass + runtimeMass) / 2);
}

function deriveOperationalEvidenceKind(signal: CanonicalExternalSignal): OperationalEvidenceKind {
  let candidates: OperationalEvidenceKind[] = ['runtime', 'change', 'static', 'dependency'];
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
  return best && best.score >= minimumEvidence ? best.kind : 'external';
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

function bound01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizePathSeparators(value: string): string {
  let separator = String.fromCharCode('/'.charCodeAt(0) + '-'.charCodeAt(0));
  return [...value].map((char) => (char === separator ? '/' : char)).join('');
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

function runtimeRealityFactor(signal: RuntimeSignal): number {
  let provenanceSignals = [
    signal.evidenceMode === 'observed' ? signal.confidence : 0,
    signal.observedAt ? signal.confidence : 0,
    signal.sourceArtifact ? signal.confidence : 0,
    positiveSignal(signal.affectedFilePaths.length),
    positiveSignal(signal.affectedCapabilityIds.length + signal.affectedFlowIds.length),
    positiveSignal(signal.frequency),
    positiveSignal(signal.affectedUsers),
  ];
  let inferredSignals = [
    signal.evidenceMode === 'inferred' ? signal.confidence : 0,
    signal.evidenceMode === 'simulated' || signal.evidenceMode === 'skipped'
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
      candidate.evidenceMode === 'observed' &&
      candidate.evidenceKind !== signal.evidenceKind,
  );
  let comparableImpact = comparable.map((candidate) =>
    Math.max(bound01(candidate.impactScore), computeImpactScore(candidate)),
  );
  let observedPeerCeiling = Math.max(0, ...comparableImpact);
  if (signal.evidenceMode === 'observed' && signal.evidenceKind === 'runtime') {
    return bound01(Math.max(weighted, observedMeanOrSelf(comparableImpact, weighted)));
  }
  if (signal.evidenceKind === 'static' && observedPeerCeiling > 0) {
    let staticCeiling =
      observedPeerCeiling * bound01(signal.confidence / Math.max(1, signal.count));
    return Math.min(staticCeiling, weighted);
  }
  return bound01(weighted);
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
import "./__parts__/runtime-fusion.part";
