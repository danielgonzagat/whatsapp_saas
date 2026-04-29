import type { PulseConvergenceExecutionMode } from './types.convergence';

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

/** A single path entry in the full path coverage state. */
export interface PathCoverageEntry {
  /** Stable path id from the execution matrix. */
  pathId: string;
  /** Human-readable entrypoint description. */
  entrypoint: string;
  /** Risk level from the execution matrix. */
  risk: 'low' | 'medium' | 'high' | 'critical';
  /** Execution mode from the execution matrix; human_required is legacy input only. */
  executionMode: PulseConvergenceExecutionMode;
  /** Terminal classification after coverage analysis. */
  classification: PathClassification;
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
  evidenceMode: 'observed' | 'blueprint' | 'inferred' | 'blocked';
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
    /** Legacy compatibility counter; new coverage states should keep this at zero. */
    blockedHuman: number;
    criticalInferredOnly: number;
    /** Legacy compatibility counter; risk should require probes/sandboxing, not human blocking. */
    criticalBlockedHuman: number;
    criticalUnobserved: number;
    coveragePercent: number;
  };
  /** All classified path entries. */
  paths: PathCoverageEntry[];
}
