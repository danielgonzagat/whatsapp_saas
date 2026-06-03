export type HarnessTargetKind =
  | 'function'
  | 'service'
  | 'controller'
  | 'endpoint'
  | 'worker'
  | 'cron'
  | 'webhook'
  | 'script';
export type HarnessExecutionStatus =
  | 'planned'
  | 'not_executed'
  | 'not_tested'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'error'
  | 'skipped';
export type HarnessFixtureKind =
  | 'db_seed'
  | 'mock_service'
  | 'test_env'
  | 'queue_message'
  | 'webhook_payload'
  | 'auth_token';
export type ExecutionFeasibility = 'executable' | 'needs_staging' | 'cannot_execute';

export interface HarnessGeneratedTest {
  /** Human-readable test name (e.g. "should return 200 for valid request") */
  testName: string;
  /** Generated catalog status. Plans are not executable proof. */
  status: 'planned' | 'not_executed';
  /** The generated test harness code as a string */
  code: string;
  /** Test framework hint: jest, vitest, playwright, supertest */
  framework: 'jest' | 'vitest' | 'playwright' | 'supertest' | 'unknown';
  /** Whether this test can run without staging infrastructure */
  canRunLocally: boolean;
}

export interface HarnessTarget {
  targetId: string;
  kind: HarnessTargetKind;
  name: string;
  filePath: string;
  methodName: string | null;
  routePattern: string | null;
  httpMethod: string | null;
  requiresAuth: boolean;
  requiresTenant: boolean;
  dependencies: string[]; // other target IDs this depends on
  fixtures: HarnessFixture[];
  /** Execution feasibility classification */
  feasibility: ExecutionFeasibility;
  /** Human-readable reason for the feasibility classification */
  feasibilityReason: string;
  /** Generated test harness code (only for executable targets) */
  generatedTests: HarnessGeneratedTest[];
  /** Tracks whether this target has been dispatched for real execution */
  generated: boolean;
}

export interface HarnessFixture {
  kind: HarnessFixtureKind;
  name: string;
  description: string;
  data: unknown; // fixture data/configuration
  required: boolean;
  generated: boolean;
}

export interface HarnessExecutionResult {
  targetId: string;
  status: HarnessExecutionStatus;
  executionTimeMs: number;
  attempts: number;
  error: string | null;
  output: unknown | null;
  dbSideEffects: Array<{ model: string; operation: string; count: number }>;
  logEntries: string[];
  startedAt: string;
  finishedAt: string;
}

export interface HarnessEvidence {
  generatedAt: string;
  summary: {
    totalTargets: number;
    plannedTargets: number;
    notExecutedTargets: number;
    testedTargets: number;
    passedTargets: number;
    failedTargets: number;
    blockedTargets: number;
    criticalTargets: number;
    criticalTested: number;
    criticalPassed: number;
    executableTargets: number;
    needsStagingTargets: number;
    cannotExecuteTargets: number;
    generatedTestCount: number;
  };
  targets: HarnessTarget[];
  results: HarnessExecutionResult[];
  /** Behavior graph nodes loaded for classification (subset used) */
  behaviorNodeCount: number;
}
