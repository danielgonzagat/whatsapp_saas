// PULSE — Live Codebase Nervous System
// Perfectness Test Harness types (Wave 9)

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
 * A single gate in the perfectness evaluation.
 *
 * Each gate checks one dimension of correctness against a target
 * value and records whether it passed with supporting evidence.
 */
export interface PerfectnessGate {
  /** Unique gate name (e.g. 'pulse-core-green'). */
  name: string;
  /** Human-readable description of what this gate checks. */
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
  /** Human-readable summary of the perfectness evaluation. */
  summary: string;
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
 * 7. **no-protected-violation** — zero protected file changes
 * 8. **72h-elapsed** — at least 72 hours of autonomous work completed
 */
