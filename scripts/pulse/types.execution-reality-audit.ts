/** Reality mode for a PULSE execution evidence record. */
export type PulseExecutionRealityMode = 'planned' | 'simulated' | 'inferred' | 'observed';

/** Minimal normalized input accepted by the execution reality audit. */
export interface PulseExecutionRealityInput {
  /** Stable record id. */
  id: string;
  /** Origin artifact or engine, for traceability. */
  sourceArtifact: string;
  /** Native status from the source artifact. */
  status?: string;
  /** Native truth mode, when present. */
  truthMode?: string;
  /** Native evidence mode, when present. */
  evidenceMode?: string;
  /** Native source label, when present. */
  source?: string;
  /** Whether the source says an execution attempt happened. */
  executed?: boolean;
  /** Attempt count from harness/test artifacts. */
  attempts?: number;
  /** Runtime duration in milliseconds. */
  executionTimeMs?: number;
  /** Command exit code, when the source is a command-backed proof. */
  exitCode?: number;
  /** Start timestamp for an execution window. */
  startedAt?: string | null;
  /** Finish timestamp for an execution window. */
  finishedAt?: string | null;
  /** Supporting artifacts for the record. */
  artifactPaths?: string[];
  /** Human-readable source summary. */
  summary?: string;
}

/** Classified reality record. */
export interface PulseExecutionRealityRecord extends PulseExecutionRealityInput {
  /** Normalized reality mode. */
  mode: PulseExecutionRealityMode;
  /** Whether this record can count as observed proof. */
  countsAsObservedProof: boolean;
  /** Machine-readable reason for the classification. */
  reason: string;
}

/** Aggregate audit state for execution reality records. */
export interface PulseExecutionRealityAuditState {
  artifact: 'PULSE_EXECUTION_REALITY_AUDIT';
  artifactVersion: 1;
  generatedAt: string;
  summary: {
    totalRecords: number;
    planned: number;
    simulated: number;
    inferred: number;
    observed: number;
    observedProof: number;
    nonObservedProof: number;
  };
  records: PulseExecutionRealityRecord[];
}
