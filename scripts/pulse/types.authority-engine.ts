// PULSE — Live Codebase Nervous System
// Wave 8 — Authority Engine types

/**
 * Authority levels in increasing order of autonomy.
 *
 * - `advisory_only`: PULSE can only report and recommend.
 * - `operator_gated`: PULSE can execute with operator-grade gates and sandbox evidence.
 * - `bounded_autonomous`: PULSE can execute ai_safe units autonomously.
 * - `certified_autonomous`: PULSE can execute all units autonomously and declare completion.
 * - `production_authority`: PULSE has full autonomy to merge, deploy, and operate in production.
 */
export type AuthorityLevel =
  | 'advisory_only'
  | 'operator_gated'
  | 'bounded_autonomous'
  | 'certified_autonomous'
  | 'production_authority';

/** A single gate that must be passed to advance to the next authority level. */
export interface AuthorityTransitionGate {
  /** Whether this gate is required for the transition. */
  required: boolean;
  /** Whether this gate has been passed. */
  passed: boolean;
  /** Short, unique gate identifier (e.g. "selfTrust", "multiCycle"). */
  name: string;
  /** Human-readable description of what the gate verifies. */
  description: string;
  /** List of evidence artifact paths or identifiers supporting the decision. */
  evidence: string[];
}

/** Full authority engine state. */
export interface AuthorityState {
  /** Currently active authority level. */
  currentLevel: AuthorityLevel;
  /** Level the engine is currently targeting. */
  targetLevel: AuthorityLevel;
  /**
   * Map from target authority level to the set of gates required to reach it.
   * Only levels above `currentLevel` need populated gates.
   */
  transitions: Record<AuthorityLevel, AuthorityTransitionGate[]>;
  /** Whether the engine can advance from `currentLevel` to `targetLevel`. */
  canAdvance: boolean;
  /** Names of gates that are blocking advancement. */
  blockingGates: string[];
  /** ISO-8601 timestamp of the last advancement, or null if never advanced. */
  lastAdvanced: string | null;
  /** Full history of authority level transitions. */
  history: Array<{
    /** Source authority level. */
    from: AuthorityLevel;
    /** Destination authority level. */
    to: AuthorityLevel;
    /** ISO-8601 timestamp of the transition. */
    at: string;
    /** Human-readable reason for the transition. */
    reason: string;
  }>;
}

/**
 * Required gates per level transition:
 *
 * advisory_only → operator_gated:
 *   - selfTrust PASS
 *   - externalReality PASS
 *
 * operator_gated → bounded_autonomous:
 *   - selfTrust PASS
 *   - externalReality PASS
 *   - runtimeEvidence fresh
 *   - criticalPaths observed
 *   - multiCycle PASS
 *
 * bounded_autonomous → certified_autonomous:
 *   - selfTrust PASS
 *   - externalReality PASS
 *   - runtimeEvidence fresh
 *   - criticalPaths observed
 *   - multiCycle PASS
 *   - noOverclaim PASS
 *   - governed blocker backlog zero
 *   - productionProof > 90%
 *
 * certified_autonomous → production_authority:
 *   - selfTrust PASS
 *   - externalReality PASS
 *   - runtimeEvidence fresh
 *   - criticalPaths observed
 *   - multiCycle PASS
 *   - noOverclaim PASS
 *   - governed blocker backlog zero
 *   - productionProof > 90%
 *   - 72h autonomous test PASS
 *   - zeroPromptProductionGuidance SIM
 */
