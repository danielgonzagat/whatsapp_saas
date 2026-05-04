// PULSE — Live Codebase Nervous System
// Perfectness Test Harness types (Wave 9.4)

/**
 * A phase in the perfectness evaluation lifecycle.
 *
 * Each phase represents a stage in the full autonomous work cycle
 * that the Perfectness Test Harness evaluates.
 */
export type PerfectnessPhase =
  | 'fresh_branch'
  | 'pulse_run'
  | 'autonomous_work'
  | 'validation'
  | 'verdict';

/**
 * The overall verdict of a perfectness evaluation.
 *
 * - `PERFECT`: all gates pass (score = 8)
 * - `ALMOST_PERFECT`: 6+ gates pass
 * - `NEEDS_WORK`: 3–5 gates pass
 * - `FAILED`: fewer than 3 gates pass
 */
export type PerfectnessVerdict = 'PERFECT' | 'ALMOST_PERFECT' | 'NEEDS_WORK' | 'FAILED';

/**
 * Exit condition for a specific gate.
 *
 * Defines what must happen for the test to exit (pass or fail)
 * and what the resulting action should be.
 */
export type ExitAction =
  | 'continue_autonomous' // Gate passed; autonomous work continues
  | 'retry_sandbox' // Gate failed; retry in a new sandbox
  | 'rollback_and_stop' // Gate failed; rollback and terminate
  | 'mark_perfect'; // All gates passed; final verdict is PERFECT

export interface GateExitCondition {
  /** The gate name this exit condition applies to. */
  gateName: string;
  /** The action to take when the gate passes. */
  onPass: ExitAction;
  /** The action to take when the gate fails. */
  onFail: ExitAction;
  /** Maximum number of retries before stopping the autonomous run. */
  maxRetries: number;
  /** Plain-language description of the exit behavior. */
  description: string;
}

/**
 * Expected evidence sources for gate evaluation.
 */
export interface GateEvidenceSource {
  /** The file or data source to read evidence from. */
  source: string;
  /** What field or key to extract from the source. */
  field: string;
  /** How to interpret the extracted value. */
  interpretation: string;
}

/**
 * A single gate in the perfectness evaluation.
 *
 * Each gate checks one dimension of correctness against a target
 * value and records whether it passed with supporting evidence.
 */
export interface PerfectnessGate {
  /** Unique gate name (e.g. 'pulse-core-green'). */
  name: string;
  /** Plain-language description of what this gate checks. */
  description: string;
  /** The target value or condition that must be met. */
  target: string;
  /** The actual observed value or condition. */
  actual: string;
  /** Whether the gate condition was satisfied. */
  passed: boolean;
  /** Supporting evidence for the evaluation (file paths, scores, timestamps). */
  evidence: string;
}

/** Detailed evidence for the 72-hour long-run autonomy gate. */
export interface PerfectnessLongRunEvidence {
  /** Required continuous autonomous operation window in hours. */
  requiredHours: number;
  /** Observed autonomous operation window in hours. */
  observedHours: number;
  /** Number of daemon/autonomy cycles used as proof samples. */
  cycleCount: number;
  /** Longest uncovered gap between proof samples, in hours. */
  maxGapHours: number;
  /** Maximum allowed uncovered gap between proof samples, in hours. */
  allowedGapHours: number;
  /** Status recorded by the continuous autonomy daemon, if present. */
  status: string;
  /** Whether the long-run proof meets the 72-hour criteria. */
  passed: boolean;
  /** Plain-language reason for the long-run verdict. */
  reason: string;
}

/**
 * Evidence collection plan for a single gate.
 *
 * Maps each gate to what data it needs, where to find it,
 * and how to interpret the result.
 */
export interface GateEvidencePlan {
  gateName: string;
  evidenceSources: GateEvidenceSource[];
  collectionMethod: 'file_read' | 'command_output' | 'api_probe' | 'static_analysis';
  fallbackIfMissing: string;
}

/**
 * Test suite structure: ordered phases with gates.
 */
export interface PerfectnessTestSuite {
  /** Phase definitions in execution order. */
  phases: Array<{
    phase: PerfectnessPhase;
    /** Gates evaluated in this phase. */
    gates: string[];
    /** Whether this phase depends on the previous phase passing. */
    dependsOnPrevious: boolean;
    /** Whether this phase can run in parallel with other phases. */
  }>;
  /** Gate dependencies (a gate that depends on another gate being evaluated first). */
  gateDependencies: Record<string, string[]>;
  /** Exit conditions per gate. */
  exitConditions: GateExitCondition[];
  /** Evidence collection plans per gate. */
  evidencePlans: GateEvidencePlan[];
}

/**
 * Full result of a perfectness evaluation run.
 *
 * Captures the start and end state, iteration counts, score deltas,
 * and the final verdict with per-gate reasoning.
 */
export interface PerfectnessResult {
  /** ISO-8601 timestamp of when the evaluation started. */
  startedAt: string;
  /** ISO-8601 timestamp of when the evaluation completed, or null if still running. */
  finishedAt: string | null;
  /** Total duration of the evaluation in hours. */
  durationHours: number;
  /** Total number of autonomous work iterations recorded. */
  totalIterations: number;
  /** Iterations accepted (passed validation). */
  acceptedIterations: number;
  /** Iterations rejected (failed validation). */
  rejectedIterations: number;
  /** Number of rollbacks performed during the evaluation period. */
  rollbacks: number;
  /** PULSE score at the start of the evaluation. */
  scoreStart: number;
  /** PULSE score at the end of the evaluation. */
  scoreEnd: number;
  /** The final perfectness verdict. */
  verdict: PerfectnessVerdict;
  /** Detailed per-gate evaluation results. */
  gates: PerfectnessGate[];
  /** Detailed evidence for the 72-hour autonomy window gate. */
  longRunEvidence: PerfectnessLongRunEvidence;
  /** Plain-language summary of the perfectness evaluation. */
  summary: string;
  /** Ordered list of actions recommended based on the verdict. */
  recommendedActions: string[];
  /** Whether the system is approved for continuous autonomous operation. */
  autonomousApproved: boolean;
}

/**
 * Perfectness evaluation gates:
 *
 * 1. **pulse-core-green** — all PULSE certification gates pass
 * 2. **product-core-green** — all critical capabilities are `real` (not partial/latent/phantom)
 * 3. **e2e-core-pass** — scenario pass rate >= 90%
 * 4. **runtime-stable** — no new Sentry errors during evaluation
 * 5. **no-regression** — final score >= start score
 * 6. **no-rollback-unrecovered** — all rollbacks successfully recovered
 * 7. **no-protected-violation** — zero protected file changes during autonomous work
 * 8. **72h-elapsed** — at least 72 hours of autonomous work completed
 */
