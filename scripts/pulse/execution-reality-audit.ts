import type {
  PulseExecutionRealityAuditState,
  PulseExecutionRealityInput,
  PulseExecutionRealityMode,
  PulseExecutionRealityRecord,
} from './types.execution-reality-audit';

const PLANNED_STATUSES = new Set([
  'planned',
  'not_executed',
  'not_tested',
  'not_run',
  'skipped',
  'untested',
  'blueprint_ready',
]);

const SIMULATED_STATUSES = new Set(['simulated', 'mocked', 'synthetic']);
const INFERRED_STATUSES = new Set(['inferred', 'inferred_only', 'terminal_reasoned']);
const OBSERVED_STATUSES = new Set([
  'passed',
  'failed',
  'blocked',
  'error',
  'observed',
  'observed_pass',
  'observed_fail',
  'captured',
  'executed',
  'valid',
  'broken',
]);

const PLANNED_EVIDENCE_MODES = new Set(['planned', 'blueprint']);
const SIMULATED_EVIDENCE_MODES = new Set(['simulated', 'mocked', 'synthetic']);
const INFERRED_EVIDENCE_MODES = new Set(['inferred', 'aspirational']);
const OBSERVED_EVIDENCE_MODES = new Set(['observed', 'observed-from-disk', 'live']);

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

function hasExecutionWindow(input: PulseExecutionRealityInput): boolean {
  return Boolean(input.startedAt && input.finishedAt);
}

function hasPositiveExecutionSignal(input: PulseExecutionRealityInput): boolean {
  return (
    input.executed === true ||
    (typeof input.attempts === 'number' && input.attempts > 0) ||
    (typeof input.executionTimeMs === 'number' && input.executionTimeMs > 0) ||
    hasExecutionWindow(input) ||
    input.exitCode === 0
  );
}

function classifyByMarkers(input: PulseExecutionRealityInput): {
  mode: PulseExecutionRealityMode | null;
  reason: string | null;
} {
  const status = normalize(input.status);
  const truthMode = normalize(input.truthMode);
  const evidenceMode = normalize(input.evidenceMode);
  const source = normalize(input.source);

  if (
    SIMULATED_STATUSES.has(status) ||
    SIMULATED_EVIDENCE_MODES.has(truthMode) ||
    SIMULATED_EVIDENCE_MODES.has(evidenceMode) ||
    SIMULATED_EVIDENCE_MODES.has(source)
  ) {
    return { mode: 'simulated', reason: 'record is explicitly simulated' };
  }

  if (PLANNED_STATUSES.has(status) || PLANNED_EVIDENCE_MODES.has(evidenceMode)) {
    return { mode: 'planned', reason: 'record is a plan or blueprint, not execution evidence' };
  }

  if (
    INFERRED_STATUSES.has(status) ||
    INFERRED_EVIDENCE_MODES.has(truthMode) ||
    INFERRED_EVIDENCE_MODES.has(evidenceMode)
  ) {
    return { mode: 'inferred', reason: 'record is inferred from structure or prior analysis' };
  }

  return { mode: null, reason: null };
}

/** Classify one PULSE evidence record into planned, simulated, inferred, or observed. */
export function classifyExecutionReality(
  input: PulseExecutionRealityInput,
): PulseExecutionRealityRecord {
  const markerClassification = classifyByMarkers(input);
  if (markerClassification.mode) {
    return {
      ...input,
      mode: markerClassification.mode,
      countsAsObservedProof: false,
      reason: markerClassification.reason ?? 'record cannot count as observed proof',
    };
  }

  const status = normalize(input.status);
  const truthMode = normalize(input.truthMode);
  const evidenceMode = normalize(input.evidenceMode);
  const executionObserved =
    hasPositiveExecutionSignal(input) &&
    (OBSERVED_STATUSES.has(status) ||
      OBSERVED_EVIDENCE_MODES.has(truthMode) ||
      OBSERVED_EVIDENCE_MODES.has(evidenceMode));

  if (executionObserved) {
    return {
      ...input,
      mode: 'observed',
      countsAsObservedProof: true,
      reason: 'record has a terminal observed status and execution signal',
    };
  }

  if (OBSERVED_STATUSES.has(status)) {
    return {
      ...input,
      mode: 'planned',
      countsAsObservedProof: false,
      reason: 'terminal status lacks execution attempts, timestamps, or command proof',
    };
  }

  return {
    ...input,
    mode: 'inferred',
    countsAsObservedProof: false,
    reason: 'record lacks enough execution markers to prove observation',
  };
}

/** Build an aggregate PULSE execution reality audit state from normalized inputs. */
export function buildExecutionRealityAuditState(
  inputs: PulseExecutionRealityInput[],
  generatedAt: string = new Date().toISOString(),
): PulseExecutionRealityAuditState {
  const records = inputs.map((input) => classifyExecutionReality(input));

  return {
    artifact: 'PULSE_EXECUTION_REALITY_AUDIT',
    artifactVersion: 1,
    generatedAt,
    summary: {
      totalRecords: records.length,
      planned: records.filter((record) => record.mode === 'planned').length,
      simulated: records.filter((record) => record.mode === 'simulated').length,
      inferred: records.filter((record) => record.mode === 'inferred').length,
      observed: records.filter((record) => record.mode === 'observed').length,
      observedProof: records.filter((record) => record.countsAsObservedProof).length,
      nonObservedProof: records.filter((record) => !record.countsAsObservedProof).length,
    },
    records,
  };
}
