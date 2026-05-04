import type { PulseExecutionMatrixBreakpoint } from './types.execution-matrix';

/**
 * PULSE Wave 6 — Full Path Coverage Engine types.
 *
 * Defines the classification taxonomy for every executable path in the
 * execution matrix and the coverage state artifact.
 */

/** Terminal classification assigned to every matrix path after coverage analysis. */
export type PathClassification =
  | 'observed_pass'
  | 'observed_fail'
  | 'probe_blueprint_generated'
  | 'inferred_only'
  /** @deprecated Legacy matrix compatibility only. New coverage states should classify risk gaps as inferred/probe work. */
  | 'blocked_human_required'
  | 'unreachable'
  | 'not_executable';

/** Execution modes emitted by the path coverage artifact. */
export type PathCoverageExecutionMode = 'ai_safe' | 'governed_validation';

/** Artifact reference needed to materialize or validate a generated probe. */
export interface PathCoverageArtifactLink {
  artifactPath: string;
  relationship: 'source_matrix' | 'coverage_state' | 'probe_blueprint' | 'observed_evidence';
}

/** Expected proof item before a blueprint can become observed evidence. */
export interface PathCoverageExpectedEvidence {
  kind: 'static' | 'unit' | 'integration' | 'e2e' | 'runtime' | 'external';
  required: boolean;
  reason: string;
}

/** Structural safety decision used to route the next executable probe. */
export interface PathCoverageStructuralSafetyClassification {
  risk: 'low' | 'medium' | 'high' | 'critical';
  safeToExecute: boolean;
  executionMode: PathCoverageExecutionMode;
  protectedSurface: boolean;
  reason: string;
}

/** Observable terminal proof state for a path coverage entry. */
export interface PathCoverageTerminalProof {
  /** Whether this path is observed, terminally reasoned, ready for a probe, or still lacks a precise proof route. */
  status: 'observed' | 'terminal_reasoned' | 'blueprint_ready' | 'inferred_gap';
  /** Matrix breakpoint that explains where evidence stops, when known. */
  breakpoint: PulseExecutionMatrixBreakpoint | null;
  /** Most precise command an AI worker can run to produce or refresh evidence. */
  validationCommand: string;
  /** Human-readable reason for the proof status. */
  reason: string;
}

/** A single path entry in the full path coverage state. */
export interface PathCoverageEntry {
  /** Stable path id from the execution matrix. */
  pathId: string;
  /** Human-readable entrypoint description. */
  entrypoint: string;
  /** Risk level from the execution matrix. */
  risk: 'low' | 'medium' | 'high' | 'critical';
  /** Execution mode from the execution matrix; human_required is legacy input only. */
  executionMode: PathCoverageExecutionMode;
  /** Terminal classification after coverage analysis. */
  classification: PathClassification;
  /** Precise terminal reason explaining why the path is observed, inferred, or blueprint-only. */
  terminalReason: string;
  /** Whether a test or probe was generated for this path. */
  testGenerated: boolean;
  /** File path of the generated test, or null. */
  testFilePath: string | null;
  /** Whether an AI agent may safely execute this path autonomously. */
  safeToExecute: boolean;
  /** Fixtures required for the generated test. */
  fixtureNeeded: string[];
  /** ISO timestamp of last probe execution, or null. */
  lastProbed: string | null;
  /** Whether this entry is only a generated plan and not runtime evidence. */
  evidenceMode: 'observed' | 'blueprint' | 'inferred';
  /** How an autonomous worker may handle this path next. */
  probeExecutionMode: PathCoverageExecutionMode;
  /** Minimal command that refreshes the evidence surface for this path. */
  validationCommand: string;
  /** Proof required before this path can become observed. */
  expectedEvidence: PathCoverageExpectedEvidence[];
  /** Structural safety routing for the next probe worker. */
  structuralSafetyClassification: PathCoverageStructuralSafetyClassification;
  /** Related artifacts needed to execute or audit this path. */
  artifactLinks: PathCoverageArtifactLink[];
  /** Explicit proof route that prevents inferred terminal paths from looking observed. */
  terminalProof: PathCoverageTerminalProof;
}

/** Full path coverage state artifact stored at .pulse/current/PULSE_PATH_COVERAGE.json. */
export interface PathCoverageState {
  /** Generation timestamp. */
  generatedAt: string;
  /** Aggregate summary of the coverage state. */
  summary: {
    totalPaths: number;
    observedPass: number;
    observedFail: number;
    testGenerated: number;
    probeBlueprintGenerated: number;
    inferredOnly: number;
    criticalInferredOnly: number;
    criticalUnobserved: number;
    criticalBlueprintReady: number;
    criticalTerminalReasoned: number;
    criticalInferredGap: number;
    coveragePercent: number;
  };
  /** All classified path entries. */
  paths: PathCoverageEntry[];
}
