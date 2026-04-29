import type { PulseRuntimeEvidence, PulseRuntimeProbe } from './types.convergence';
import type {
  BuildRuntimeProbesArtifactOptions,
  PulseRuntimeProbeArtifactProbe,
  PulseRuntimeProbeArtifactSource,
  PulseRuntimeProbeArtifactStatus,
  PulseRuntimeProbeFreshness,
  PulseRuntimeProbesArtifact,
} from './types.runtime-probes';

const ARTIFACT_ID = 'PULSE_RUNTIME_PROBES';
const RUNTIME_EVIDENCE_PATH = 'PULSE_RUNTIME_EVIDENCE.json';
const RUNTIME_PROBES_PATH = 'PULSE_RUNTIME_PROBES.json';

export const DEFAULT_RUNTIME_PROBES_MAX_AGE_MS = 30 * 60 * 1000;

const SOURCES: ReadonlySet<string> = new Set([
  'live',
  'preserved',
  'scan_skipped',
  'not_run',
  'simulated',
  'legacy',
  'unknown',
]);

const STATUSES: ReadonlySet<string> = new Set([
  'passed',
  'failed',
  'missing_evidence',
  'skipped',
  'not_run',
  'simulated',
  'stale',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeSource(value: unknown): PulseRuntimeProbeArtifactSource {
  const candidate = stringValue(value);
  if (candidate && SOURCES.has(candidate)) {
    return candidate as PulseRuntimeProbeArtifactSource;
  }
  return 'unknown';
}

function normalizeStatus(value: unknown): PulseRuntimeProbeArtifactStatus | null {
  const candidate = stringValue(value);
  if (candidate && STATUSES.has(candidate)) {
    return candidate as PulseRuntimeProbeArtifactStatus;
  }
  return null;
}

function parseTimeMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFreshness(
  checkedAt: string,
  sourceTimestamp: string | null,
  maxAgeMs: number,
): PulseRuntimeProbeFreshness {
  const checkedAtMs = parseTimeMs(checkedAt) ?? Date.now();
  const sourceTimestampMs = parseTimeMs(sourceTimestamp);
  const ageMs = sourceTimestampMs === null ? null : Math.max(0, checkedAtMs - sourceTimestampMs);
  const fresh = ageMs !== null && ageMs <= maxAgeMs;
  return {
    checkedAt,
    sourceTimestamp,
    maxAgeMs,
    ageMs,
    fresh,
    stale: !fresh,
  };
}

function recordMetrics(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isSimulatedProbe(record: Record<string, unknown>): boolean {
  const source = stringValue(record.source);
  if (source === 'simulated') {
    return true;
  }
  const metrics = recordMetrics(record.metrics);
  const proofMode = metrics ? stringValue(metrics.proofMode) : null;
  return proofMode === 'simulated';
}

function inferRuntimeEvidenceSource(
  evidence: PulseRuntimeEvidence,
  options: BuildRuntimeProbesArtifactOptions,
): PulseRuntimeProbeArtifactSource {
  if (options.source) {
    return options.source;
  }
  const summary = evidence.summary.toLowerCase();
  if (summary.includes('reused preserved live runtime evidence')) {
    return 'preserved';
  }
  if (!evidence.executed && evidence.probes.length === 0) {
    return options.environment === 'scan' ? 'scan_skipped' : 'not_run';
  }
  if (evidence.probes.every((probe) => probe.status === 'skipped')) {
    return 'scan_skipped';
  }
  if (evidence.probes.some((probe) => probe.executed)) {
    return 'live';
  }
  return 'not_run';
}

function inferProbeSource(
  record: Record<string, unknown>,
  artifactSource: PulseRuntimeProbeArtifactSource,
): PulseRuntimeProbeArtifactSource {
  const explicit = normalizeSource(record.source);
  if (explicit !== 'unknown') {
    return explicit;
  }
  if (isSimulatedProbe(record)) {
    return 'simulated';
  }
  const executed = booleanValue(record.executed) ?? false;
  const status = normalizeStatus(record.status);
  if (status === 'skipped') {
    return 'scan_skipped';
  }
  if (!executed) {
    return 'not_run';
  }
  if (artifactSource === 'preserved') {
    return 'preserved';
  }
  return artifactSource === 'legacy' || artifactSource === 'unknown' ? 'unknown' : 'live';
}

function normalizeProbeStatus(
  record: Record<string, unknown>,
  executed: boolean,
  source: PulseRuntimeProbeArtifactSource,
): PulseRuntimeProbeArtifactStatus {
  if (source === 'simulated') {
    return 'simulated';
  }
  const status = normalizeStatus(record.status);
  if (!executed && status === 'passed') {
    return 'not_run';
  }
  if (status) {
    return status;
  }
  return executed ? 'missing_evidence' : 'not_run';
}

function sourceCanProve(source: PulseRuntimeProbeArtifactSource): boolean {
  return source === 'live' || source === 'preserved';
}

function normalizeProbe(
  value: unknown,
  artifactSource: PulseRuntimeProbeArtifactSource,
  checkedAt: string,
  sourceTimestamp: string | null,
  maxAgeMs: number,
): PulseRuntimeProbeArtifactProbe {
  const record = isRecord(value) ? value : {};
  const source = inferProbeSource(record, artifactSource);
  const executed = booleanValue(record.executed) ?? false;
  const status = normalizeProbeStatus(record, executed, source);
  const freshness = buildFreshness(checkedAt, sourceTimestamp, maxAgeMs);
  const proofEligible =
    status === 'passed' && executed && freshness.fresh && sourceCanProve(source);
  const artifactPaths = unique([...stringArray(record.artifactPaths), RUNTIME_PROBES_PATH]);
  const metrics = recordMetrics(record.metrics);
  return {
    probeId: stringValue(record.probeId) ?? 'unknown',
    target: stringValue(record.target) ?? 'unknown',
    required: booleanValue(record.required) ?? false,
    executed,
    status,
    source,
    proofEligible,
    failureClass: stringValue(record.failureClass) ?? undefined,
    summary: stringValue(record.summary) ?? 'Runtime probe has no summary.',
    latencyMs: numberValue(record.latencyMs),
    artifactPaths,
    freshness,
    metrics,
  };
}

function computeTotals(
  probes: PulseRuntimeProbeArtifactProbe[],
): PulseRuntimeProbesArtifact['totals'] {
  return {
    total: probes.length,
    executed: probes.filter((probe) => probe.executed).length,
    passed: probes.filter((probe) => probe.status === 'passed').length,
    failed: probes.filter((probe) => probe.status === 'failed').length,
    missingEvidence: probes.filter((probe) => probe.status === 'missing_evidence').length,
    skipped: probes.filter((probe) => probe.status === 'skipped').length,
    notRun: probes.filter((probe) => probe.status === 'not_run').length,
    simulated: probes.filter((probe) => probe.status === 'simulated').length,
    stale: probes.filter(
      (probe) =>
        probe.status === 'stale' ||
        (probe.executed && probe.status === 'passed' && probe.freshness.stale),
    ).length,
    proofEligible: probes.filter((probe) => probe.proofEligible).length,
  };
}

function computeArtifactStatus(
  probes: PulseRuntimeProbeArtifactProbe[],
  executed: boolean,
): PulseRuntimeProbeArtifactStatus {
  if (probes.length === 0) {
    return executed ? 'missing_evidence' : 'not_run';
  }
  if (probes.some((probe) => probe.status === 'failed')) {
    return 'failed';
  }
  if (probes.some((probe) => probe.required && probe.status === 'missing_evidence')) {
    return 'missing_evidence';
  }
  if (probes.every((probe) => probe.status === 'skipped')) {
    return 'skipped';
  }
  if (probes.every((probe) => probe.status === 'simulated')) {
    return 'simulated';
  }
  if (probes.every((probe) => probe.status === 'not_run')) {
    return 'not_run';
  }
  const required = probes.filter((probe) => probe.required);
  const requiredEligible = required.length === 0 || required.every((probe) => probe.proofEligible);
  if (probes.some((probe) => probe.proofEligible) && requiredEligible) {
    return 'passed';
  }
  if (probes.some((probe) => probe.status === 'passed' && probe.freshness.stale)) {
    return 'stale';
  }
  return executed ? 'missing_evidence' : 'not_run';
}

function buildArtifactSummary(
  status: PulseRuntimeProbeArtifactStatus,
  totals: PulseRuntimeProbesArtifact['totals'],
): string {
  return `Runtime probes ${status}: ${totals.proofEligible}/${totals.total} proof-eligible, ${totals.executed} executed.`;
}

function sourceTimestampFromRecord(record: Record<string, unknown>): string | null {
  const direct = stringValue(record.sourceTimestamp);
  if (direct) {
    return direct;
  }
  const freshness = isRecord(record.freshness) ? record.freshness : null;
  return freshness ? stringValue(freshness.sourceTimestamp) : null;
}

function artifactFromRecord(
  record: Record<string, unknown>,
  options: BuildRuntimeProbesArtifactOptions,
): PulseRuntimeProbesArtifact {
  const generatedAt =
    stringValue(record.generatedAt) ?? options.generatedAt ?? new Date().toISOString();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_RUNTIME_PROBES_MAX_AGE_MS;
  const source = options.source ?? normalizeSource(record.source);
  const effectiveSource = source === 'unknown' ? 'unknown' : source;
  const sourceTimestamp =
    sourceTimestampFromRecord(record) ?? (effectiveSource === 'live' ? generatedAt : null);
  const rawProbes = Array.isArray(record.probes) ? record.probes : [];
  const probes = rawProbes.map((probe) =>
    normalizeProbe(probe, effectiveSource, generatedAt, sourceTimestamp, maxAgeMs),
  );
  const executed =
    booleanValue(record.executed) ??
    probes.some(
      (probe) => probe.executed && probe.source !== 'simulated' && probe.status !== 'skipped',
    );
  const status = computeArtifactStatus(probes, executed);
  const totals = computeTotals(probes);
  const artifactPaths = unique([
    ...stringArray(record.artifactPaths),
    RUNTIME_EVIDENCE_PATH,
    RUNTIME_PROBES_PATH,
  ]);
  return {
    artifact: ARTIFACT_ID,
    artifactVersion: 1,
    generatedAt,
    environment: options.environment,
    executed,
    source: effectiveSource,
    status,
    freshness: buildFreshness(generatedAt, sourceTimestamp, maxAgeMs),
    summary: stringValue(record.summary) ?? buildArtifactSummary(status, totals),
    artifactPaths,
    probes,
    totals,
  };
}

/** Build the self-describing runtime probes artifact from runtime evidence. */
export function buildRuntimeProbesArtifact(
  runtimeEvidence: PulseRuntimeEvidence,
  options: BuildRuntimeProbesArtifactOptions = {},
): PulseRuntimeProbesArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const evidenceRecord = runtimeEvidence as unknown as Record<string, unknown>;
  const source = inferRuntimeEvidenceSource(runtimeEvidence, options);
  const sourceTimestamp =
    stringValue(evidenceRecord.generatedAt) ?? (source === 'live' ? generatedAt : null);
  return artifactFromRecord(
    {
      artifact: ARTIFACT_ID,
      artifactVersion: 1,
      generatedAt,
      source,
      sourceTimestamp,
      executed: runtimeEvidence.executed,
      summary: runtimeEvidence.summary,
      artifactPaths: runtimeEvidence.artifactPaths,
      probes: runtimeEvidence.probes as PulseRuntimeProbe[],
    },
    {
      ...options,
      generatedAt,
      source,
    },
  );
}

/** Normalize a persisted runtime probes artifact or a legacy probes array. */
export function normalizeRuntimeProbesArtifact(
  raw: unknown,
  options: BuildRuntimeProbesArtifactOptions = {},
): PulseRuntimeProbesArtifact | null {
  if (Array.isArray(raw)) {
    return artifactFromRecord(
      {
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        source: options.source ?? 'legacy',
        executed: raw.some((entry) => isRecord(entry) && entry.executed === true),
        summary: 'Legacy runtime probes array normalized into a self-describing artifact.',
        artifactPaths: [RUNTIME_PROBES_PATH],
        probes: raw,
      },
      options.source ? options : { ...options, source: 'legacy' },
    );
  }
  if (!isRecord(raw)) {
    return null;
  }
  return artifactFromRecord(raw, options);
}

/** Whether a normalized probe can be counted by production proof. */
export function isRuntimeProbeProofEligible(probe: PulseRuntimeProbeArtifactProbe): boolean {
  return probe.proofEligible;
}
