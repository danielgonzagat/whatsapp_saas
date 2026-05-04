import type {
  PulseRuntimeProbeArtifactProbe,
  PulseRuntimeProbeArtifactSource,
  PulseRuntimeProbeArtifactStatus,
  PulseRuntimeProbeFreshness,
} from '../../types.runtime-probes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizeSource(value: unknown): PulseRuntimeProbeArtifactSource {
  const SOURCES = new Set([
    'live',
    'preserved',
    'scan_skipped',
    'not_run',
    'simulated',
    'legacy',
    'unknown',
  ]);
  const candidate = stringValue(value);
  if (candidate && SOURCES.has(candidate)) {
    return candidate as PulseRuntimeProbeArtifactSource;
  }
  return 'unknown';
}

function normalizeStatus(value: unknown): PulseRuntimeProbeArtifactStatus | null {
  const STATUSES = new Set([
    'passed',
    'failed',
    'missing_evidence',
    'skipped',
    'not_run',
    'simulated',
    'stale',
  ]);
  const candidate = stringValue(value);
  if (candidate && STATUSES.has(candidate)) {
    return candidate as PulseRuntimeProbeArtifactStatus;
  }
  return null;
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

export function inferProbeSource(
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

export function normalizeProbeStatus(
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

export function sourceCanProve(source: PulseRuntimeProbeArtifactSource): boolean {
  return source === 'live' || source === 'preserved';
}

function parseTimeMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildFreshness(
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
