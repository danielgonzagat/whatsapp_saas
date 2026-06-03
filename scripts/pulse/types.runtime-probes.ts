import type { PulseEnvironment } from './types.health';

/** Runtime probe artifact source. */
export type PulseRuntimeProbeArtifactSource =
  | 'live'
  | 'preserved'
  | 'scan_skipped'
  | 'not_run'
  | 'simulated'
  | 'legacy'
  | 'unknown';

/** Runtime probe artifact status. */
export type PulseRuntimeProbeArtifactStatus =
  | 'passed'
  | 'failed'
  | 'missing_evidence'
  | 'skipped'
  | 'not_run'
  | 'simulated'
  | 'stale';

/** Runtime probe freshness metadata. */
export interface PulseRuntimeProbeFreshness {
  /** Timestamp when this artifact was checked/generated. */
  checkedAt: string;
  /** Timestamp of the underlying runtime source, when known. */
  sourceTimestamp: string | null;
  /** Maximum allowed age for proof eligibility. */
  maxAgeMs: number;
  /** Source age in milliseconds, or null when unknown. */
  ageMs: number | null;
  /** Whether the source is fresh enough for production proof. */
  fresh: boolean;
  /** Whether the source is stale or unknown. */
  stale: boolean;
}

/** Normalized probe entry persisted in PULSE_RUNTIME_PROBES.json. */
export interface PulseRuntimeProbeArtifactProbe {
  /** Probe id property. */
  probeId: string;
  /** Probe target property. */
  target: string;
  /** Required property. */
  required: boolean;
  /** Executed property. */
  executed: boolean;
  /** Normalized probe status. */
  status: PulseRuntimeProbeArtifactStatus;
  /** Runtime source for this probe. */
  source: PulseRuntimeProbeArtifactSource;
  /** Whether production-proof can count this probe. */
  proofEligible: boolean;
  /** Failure class property. */
  failureClass?: string;
  /** Summary property. */
  summary: string;
  /** Latency in milliseconds. */
  latencyMs?: number;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Probe freshness metadata. */
  freshness: PulseRuntimeProbeFreshness;
  /** Metrics property. */
  metrics?: Record<string, unknown>;
}

/** Self-describing runtime probes artifact. */
export interface PulseRuntimeProbesArtifact {
  /** Artifact id. */
  artifact: 'PULSE_RUNTIME_PROBES';
  /** Artifact contract version. */
  artifactVersion: 1;
  /** Generation timestamp. */
  generatedAt: string;
  /** Environment where probes were collected. */
  environment?: PulseEnvironment;
  /** Whether any non-simulated runtime probe executed. */
  executed: boolean;
  /** Runtime source for this artifact. */
  source: PulseRuntimeProbeArtifactSource;
  /** Aggregate normalized status. */
  status: PulseRuntimeProbeArtifactStatus;
  /** Artifact freshness metadata. */
  freshness: PulseRuntimeProbeFreshness;
  /** Summary property. */
  summary: string;
  /** Artifact paths property. */
  artifactPaths: string[];
  /** Normalized probes. */
  probes: PulseRuntimeProbeArtifactProbe[];
  /** Aggregate counts. */
  totals: {
    total: number;
    executed: number;
    passed: number;
    failed: number;
    missingEvidence: number;
    skipped: number;
    notRun: number;
    simulated: number;
    stale: number;
    proofEligible: number;
  };
}

/** Runtime probes artifact build options. */
export interface BuildRuntimeProbesArtifactOptions {
  /** Timestamp to use for deterministic artifact generation. */
  generatedAt?: string;
  /** Max proof age in milliseconds. */
  maxAgeMs?: number;
  /** Runtime environment. */
  environment?: PulseEnvironment;
  /** Source override. */
  source?: PulseRuntimeProbeArtifactSource;
}
