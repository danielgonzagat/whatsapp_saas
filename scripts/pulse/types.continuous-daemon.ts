// PULSE — Live Codebase Nervous System
// Wave 8 — Continuous Daemon types

/** Phase within a single daemon cycle. */
export type DaemonPhase =
  | 'scanning'
  | 'planning'
  | 'executing'
  | 'validating'
  | 'committing'
  | 'rolling_back'
  | 'waiting'
  | 'idle';

/** Outcome classification for a daemon cycle. */
export type DaemonCycleResult = 'improvement' | 'no_change' | 'regression' | 'blocked' | 'error';

/** Single autonomous iteration record produced by the continuous daemon. */
export interface DaemonCycle {
  /** Monotonically increasing iteration counter. */
  iteration: number;
  /** Phase the cycle ended in. */
  phase: DaemonPhase;
  /** Convergence unit id that was targeted, if any. */
  unitId: string | null;
  /** Agent executor name (e.g. "codex", "kilo"). */
  agent: string;
  /** Outcome classification. */
  result: DaemonCycleResult;
  /** Files that were changed during this cycle. */
  filesChanged: string[];
  /** PULSE score before this cycle started. */
  scoreBefore: number;
  /** PULSE score after this cycle completed. */
  scoreAfter: number;
  /** Wall-clock duration of the cycle in milliseconds. */
  durationMs: number;
  /** ISO-8601 timestamp when the cycle started. */
  startedAt: string;
  /** ISO-8601 timestamp when the cycle finished. */
  finishedAt: string;
  /** Human-readable summary of what happened. */
  summary: string;
}

/** Persistent state of the continuous daemon process. */
export interface ContinuousDaemonState {
  /** ISO-8601 timestamp when this snapshot was generated. */
  generatedAt: string;
  /** ISO-8601 timestamp when the daemon was first started. */
  startedAt: string;
  /** Total number of cycles executed (regardless of outcome). */
  totalCycles: number;
  /** Count of cycles that resulted in an improvement. */
  improvements: number;
  /** Count of cycles that resulted in a regression. */
  regressions: number;
  /** Count of cycles that were rolled back. */
  rollbacks: number;
  /** Current PULSE score (0–100). */
  currentScore: number;
  /** Target score the daemon is working toward. */
  targetScore: number;
  /** Score milestones achieved (recorded every 5 points). */
  milestones: Array<{
    /** Score at which the milestone was recorded. */
    score: number;
    /** ISO-8601 timestamp when this milestone was achieved. */
    achievedAt: string;
    /** Short description of what was achieved. */
    description: string;
  }>;
  /** Full cycle history. */
  cycles: DaemonCycle[];
  /** Current operational status. */
  status: 'running' | 'paused' | 'stopped' | 'certified';
  /** Estimated time to reach the target score, or null if insufficient data. */
  eta: string | null;
}
