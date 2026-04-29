/**
 * Local interface definitions for the autonomy loop.
 * These are file-private shapes (not exported from the PULSE type system).
 */
import type { JsonSchemaDefinition } from '@openai/agents';
import type { ExecutorKind } from './executor';
import type { PulseExecutionMatrixSummary } from './types.execution-matrix';

export interface PulseAutonomousDirectiveUnit {
  id: string;
  kind: string;
  priority: string;
  source: string;
  executionMode: 'ai_safe' | 'governed_sandbox' | 'observation_only' | 'human_required';
  riskLevel: string;
  evidenceMode: string;
  confidence: string;
  productImpact: string;
  ownerLane: string;
  title: string;
  summary: string;
  whyNow?: string;
  visionDelta?: string;
  targetState?: string;
  affectedCapabilities?: string[];
  affectedFlows?: string[];
  expectedGateShift?: Record<string, string>;
  validationTargets?: string[];
  validationArtifacts?: string[];
  relatedFiles?: string[];
  ownedFiles?: string[];
  readOnlyFiles?: string[];
  forbiddenFiles?: string[];
  contextDigest?: string;
  leaseId?: string;
  leaseStatus?: string;
  leaseExpiresAt?: string;
  validationContract?: string[];
  stopConditions?: string[];
  exitCriteria?: string[];
  gateNames?: string[];
  scenarioIds?: string[];
  /** Required validations that must ALL pass before the cycle counts as validated.
   *  Populated by the planner based on kind/affectedCapabilities/gateNames.
   *  Categories: 'typecheck' | 'affected-tests' | 'flow-evidence' | 'scenario-evidence' | 'browser-evidence' */
  requiredValidations?: Array<
    'typecheck' | 'affected-tests' | 'flow-evidence' | 'scenario-evidence' | 'browser-evidence'
  >;
}

/** Exit criterion — programmatically evaluable condition for unit completion. */
export interface ExitCriterion {
  id: string;
  type: 'command' | 'artifact-assertion' | 'flow-passed' | 'scenario-passed' | 'score-threshold';
  target: string;
  expected: unknown;
  comparison: 'eq' | 'gte' | 'lte' | 'contains' | 'exists';
}

export interface PulseAutonomousDirective {
  autonomyVerdict?: 'SIM' | 'NAO';
  autonomyReadiness?: {
    verdict?: 'SIM' | 'NAO';
    mode?: string;
    canWorkNow?: boolean;
    canDeclareComplete?: boolean;
    automationSafeUnits?: number;
    blockers?: string[];
    warnings?: string[];
  };
  generatedAt?: string;
  currentCheckpoint?: Record<string, unknown> | null;
  targetCheckpoint?: Record<string, unknown> | null;
  visionGap?: string | null;
  currentState?: {
    certificationStatus?: string | null;
    blockingTier?: number | null;
    score?: number | null;
  } | null;
  executionMatrix?: {
    summary?: PulseExecutionMatrixSummary;
  } | null;
  topBlockers?: string[];
  topProblems?: Array<{
    source?: string;
    type?: string;
    summary?: string;
    impactScore?: number;
    executionMode?: string;
  }>;
  nextAutonomousUnits?: PulseAutonomousDirectiveUnit[];
  nextDecisionUnits?: PulseAutonomousDirectiveUnit[];
  nextExecutableUnits?: PulseAutonomousDirectiveUnit[];
  blockedUnits?: Array<{
    id?: string;
    title?: string;
    executionMode?: string;
    summary?: string;
    whyBlocked?: string;
  }>;
  doNotTouchSurfaces?: string[];
  antiGoals?: string[];
  suggestedValidation?: {
    commands?: string[];
    artifacts?: string[];
  };
  stopCondition?: string[];
  contextFabric?: {
    broadcastRef?: string;
    leasesRef?: string;
    contextDigest?: string;
    workerEnvelopeCount?: number;
    contextBroadcastPass?: boolean;
    ownershipConflictPass?: boolean;
    protectedFilesForbiddenPass?: boolean;
    workerContextCompletenessPass?: boolean;
    staleContextBlocksExecution?: boolean;
    blockers?: string[];
  };
}

export interface PulseAutonomyDecision {
  shouldContinue: boolean;
  selectedUnitId: string;
  rationale: string;
  codexPrompt: string;
  validationCommands: string[];
  stopReason: string;
  strategyMode: 'normal' | 'adaptive_narrow_scope';
}

export interface PulseAutonomyRunOptions {
  rootDir: string;
  dryRun: boolean;
  continuous: boolean;
  maxIterations: number;
  intervalMs: number;
  parallelAgents: number;
  maxWorkerRetries: number;
  riskProfile: 'safe' | 'balanced' | 'dangerous';
  plannerModel: string | null;
  codexModel: string | null;
  disableAgentPlanner: boolean;
  /** Which agent executor to use. Default: auto-detect (codex if available, else kilo). */
  executor?: ExecutorKind | null;
  validateCommands: string[];
}

export interface PulseAutonomyArtifactSeedInput {
  directive: PulseAutonomousDirective;
  previousState?: import('./types').PulseAutonomyState | null;
  codexCliAvailable?: boolean;
  orchestrationMode?: 'single' | 'parallel';
  parallelAgents?: number;
  maxWorkerRetries?: number;
  riskProfile?: 'safe' | 'balanced' | 'dangerous';
  plannerMode?: 'agents_sdk' | 'deterministic';
  plannerModel?: string | null;
  codexModel?: string | null;
}

export interface PulseAgentOrchestrationArtifactSeedInput {
  directive: PulseAutonomousDirective;
  previousState?: import('./types').PulseAgentOrchestrationState | null;
  codexCliAvailable?: boolean;
  parallelAgents?: number;
  maxWorkerRetries?: number;
  riskProfile?: 'safe' | 'balanced' | 'dangerous';
  plannerMode?: 'agents_sdk' | 'deterministic';
}

export interface PulseAutonomySummarySnapshot {
  certificationStatus: string | null;
  blockingTier: number | null;
  score: number | null;
  visionGap: string | null;
  executionMatrixSummary?: PulseExecutionMatrixSummary | null;
}

export interface PulseRollbackGuard {
  enabled: boolean;
  reason: string | null;
}

export interface PulseWorkerWorkspace {
  workspaceMode: 'isolated_copy';
  workspacePath: string;
  patchPath: string;
}

export const PLANNER_OUTPUT_SCHEMA: JsonSchemaDefinition = {
  type: 'json_schema',
  name: 'pulse_autonomy_decision',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'shouldContinue',
      'selectedUnitId',
      'rationale',
      'codexPrompt',
      'validationCommands',
      'stopReason',
    ],
    properties: {
      shouldContinue: { type: 'boolean' },
      selectedUnitId: {
        type: 'string',
        description: 'Chosen ai_safe unit id. Use an empty string when no unit should be executed.',
      },
      rationale: { type: 'string' },
      codexPrompt: {
        type: 'string',
        description:
          'A concrete prompt for codex exec. Use an empty string only when shouldContinue is false.',
      },
      validationCommands: {
        type: 'array',
        items: { type: 'string' },
      },
      stopReason: {
        type: 'string',
        description:
          'Reason to stop the loop. Use an empty string when execution should continue normally.',
      },
    },
  },
};

export const READ_PULSE_ARTIFACT_TOOL_SCHEMA: {
  type: 'object';
  additionalProperties: false;
  required: string[];
  properties: {
    artifact: {
      type: 'string';
      enum: string[];
    };
  };
} = {
  type: 'object',
  additionalProperties: false,
  required: ['artifact'],
  properties: {
    artifact: {
      type: 'string',
      enum: ['directive', 'convergence', 'vision', 'external_signals', 'autonomy_state'],
    },
  },
};

export const AUTONOMY_ARTIFACT = 'PULSE_AUTONOMY_STATE.json';
export const AGENT_ORCHESTRATION_ARTIFACT = 'PULSE_AGENT_ORCHESTRATION_STATE.json';
export const AUTONOMY_MEMORY_ARTIFACT = 'PULSE_AUTONOMY_MEMORY.json';
export const DEFAULT_MAX_ITERATIONS = 5;
export const DEFAULT_INTERVAL_MS = 30_000;
export const DEFAULT_PARALLEL_AGENTS = 1;
export const DEFAULT_MAX_WORKER_RETRIES = 1;
export const DEFAULT_PLANNER_MODEL = 'gpt-4.1';
/**
 * Default validation commands — progressive ladder by category.
 *
 * Used as fallback when the planner cannot derive `requiredValidations`
 * from the unit's kind/affectedCapabilities/gateNames.
 *
 * Ladder (executed in order; first failure stops the cycle):
 *  1. typecheck — compiles all packages.
 *  2. affected-tests — runs specs for files touched by the unit.
 *  3. flow-evidence — verifies declared flows against runtime.
 *  4. scenario-evidence — runs Playwright specs for the scenario.
 */
export const DEFAULT_VALIDATION_COMMANDS = [
  'npm run typecheck',
  'npx jest --findRelatedTests --passWithNoTests',
  'node scripts/pulse/run.js --deep --fast --json',
  'npm --prefix e2e exec playwright test --pass-with-no-tests',
];
export const MINIMAL_VALIDATION_COMMANDS = [
  'npm run typecheck',
  'node scripts/pulse/run.js --guidance',
];
export const ISOLATED_WORKSPACE_DEPENDENCY_DIRS = [
  'node_modules',
  'backend/node_modules',
  'frontend/node_modules',
  'worker/node_modules',
  'e2e/node_modules',
];
export const ISOLATED_WORKSPACE_EXCLUDED_PREFIXES = ['.git', '.pulse/tmp', 'coverage', '.turbo'];
export const ISOLATED_WORKSPACE_EXCLUDED_SEGMENTS = ['node_modules', '.next'];
