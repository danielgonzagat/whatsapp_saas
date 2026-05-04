/**
 * PULSE Wave 6 — Chaos Engineering Engine types.
 *
 * Defines the taxonomy for chaos scenarios injected against external
 * dependencies and the evidence artifact that records their outcomes.
 */

/** The kind of failure condition being injected. */
export type ChaosScenarioKind =
  | 'latency'
  | 'packet_loss'
  | 'connection_drop'
  | 'slow_close'
  | 'partition'
  | 'kill_process'
  | 'dns_failure'
  | 'disk_full'
  | 'cpu_spike';

/** The external target dependency subjected to chaos. */
export type ChaosTarget =
  | 'postgres'
  | 'redis'
  | 'external_http'
  | 'webhook_receiver'
  | 'internal_api';

/** The observed outcome of a chaos scenario. */
export type ChaosResult =
  | 'degraded_gracefully'
  | 'failed_gracefully'
  | 'crashed'
  | 'hung'
  | 'recovered'
  | 'not_tested';

/** A single chaos scenario definition with its expected behavior and outcome. */
export interface ChaosScenario {
  /** Stable scenario id. */
  id: string;
  /** The failure condition being injected. */
  kind: ChaosScenarioKind;
  /** The target dependency subjected to chaos. */
  target: ChaosTarget;
  /** Human-readable description of the scenario. */
  description: string;
  /** Injection parameters: duration, intensity, and kind-specific params. */
  injectionConfig: {
    durationMs: number;
    intensity: number;
    params: Record<string, number>;
  };
  /** How the system is expected to behave under this condition. */
  expectedBehavior: string;
  /** Capability ids known to depend on this target. */
  affectedCapabilities: string[];
  /** Outcome observed (or 'not_tested' if not yet probed). */
  result: ChaosResult;
  /** Time to recovery in ms, or null if not measured/not recovered. */
  recoveryTimeMs: number | null;
  /** Other capabilities unexpectedly affected. */
  blastRadius: string[];
  /** Errors logged or observed during the scenario. */
  errorsObserved: string[];
}

/** Chaos evidence artifact stored at .pulse/current/PULSE_CHAOS_EVIDENCE.json. */
export interface ChaosEvidence {
  /** Generation timestamp. */
  generatedAt: string;
  /** Aggregate summary of the chaos catalog. */
  summary: {
    totalScenarios: number;
    testedScenarios: number;
    degradedGracefully: number;
    crashed: number;
    blastRadiusMap: Record<string, string[]>;
  };
  /** All defined chaos scenarios. */
  scenarios: ChaosScenario[];
}
