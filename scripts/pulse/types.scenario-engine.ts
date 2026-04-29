// PULSE Wave 5 — Scenario Evidence Engine types

/** Actor role executing a scenario. */
export type ScenarioRole =
  | 'customer'
  | 'operator'
  | 'admin'
  | 'anonymous'
  | 'producer'
  | 'affiliate';

/** Kind of step within a scenario. */
export type ScenarioStepKind =
  | 'login'
  | 'navigate'
  | 'click'
  | 'type'
  | 'submit'
  | 'wait'
  | 'assert'
  | 'api_call'
  | 'seed_db'
  | 'cleanup';

/** Execution status for a scenario or its individual run. */
export type ScenarioStatus = 'not_run' | 'passed' | 'failed' | 'blocked' | 'error';

/** Single atomic step inside a scenario. */
export interface ScenarioStep {
  /** Execution order (0-based). */
  order: number;
  /** Kind of step to perform. */
  kind: ScenarioStepKind;
  /** Human-readable description of the step. */
  description: string;
  /** Target element identifier, URL path, or API endpoint. */
  target: string;
  /** Expected outcome after executing this step. */
  expectedResult: string;
  /** Maximum wait time in milliseconds for this step. */
  timeout: number;
}

/** Full end-to-end scenario definition. */
export interface Scenario {
  /** Unique scenario ID. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Actor role that executes the scenario. */
  role: ScenarioRole;
  /** Parent flow this scenario validates. */
  flowId: string;
  /** Capabilities exercised by this scenario. */
  capabilityIds: string[];
  /** Ordered steps to execute. */
  steps: ScenarioStep[];
  /** Current execution status. */
  status: ScenarioStatus;
  /** ISO-8601 timestamp of last execution, or null if never run. */
  lastRun: string | null;
  /** Duration of last execution in milliseconds, or null. */
  durationMs: number | null;
  /** Paths to evidence artifacts produced during execution. */
  evidence: string[];
}

/** Complete scenario evidence state persisted to disk. */
export interface ScenarioEvidenceState {
  /** ISO-8601 timestamp when this state was generated. */
  generatedAt: string;
  /** Aggregate counts across all scenarios. */
  summary: {
    /** Total scenario count. */
    total: number;
    /** Passed scenario count. */
    passed: number;
    /** Failed scenario count. */
    failed: number;
    /** Not-run scenario count. */
    notRun: number;
    /** Scenarios marked as critical (core flows). */
    coreScenarios: number;
    /** Core scenarios that passed. */
    coreScenariosPassed: number;
  };
  /** All scenarios in the catalog. */
  scenarios: Scenario[];
}
