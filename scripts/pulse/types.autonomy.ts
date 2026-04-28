// PULSE — Live Codebase Nervous System
// Autonomous execution, agent orchestration, execution chains, and product graph types

import type { PulseExecutionMatrixSummary } from './types.execution-matrix';

// ===== NEW LAYER: Autonomous Execution =====
/** Snapshot of a convergence unit selected for autonomous work. */
export interface PulseAutonomyUnitSnapshot {
  /** Unit ID property. */
  id: string;
  /** Unit kind property. */
  kind: string;
  /** Priority property. */
  priority: string;
  /** Execution mode property. */
  executionMode: string;
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Affected capabilities property. */
  affectedCapabilities: string[];
  /** Affected flows property. */
  affectedFlows: string[];
  /** Validation targets property. */
  validationTargets: string[];
}

/** Single validation command result for autonomy loop. */
export interface PulseAutonomyValidationCommandResult {
  /** Command property. */
  command: string;
  /** Exit code property. */
  exitCode: number | null;
  /** Duration milliseconds property. */
  durationMs: number;
  /** Summary property. */
  summary: string;
}

/** Single autonomy iteration record. */
export interface PulseAutonomyIterationRecord {
  /** Iteration number property. */
  iteration: number;
  /** Planner mode property. */
  plannerMode: 'agents_sdk' | 'deterministic';
  /** Strategy mode property. */
  strategyMode?: 'normal' | 'adaptive_narrow_scope' | null;
  /** Status property. */
  status: 'planned' | 'executed' | 'validated' | 'completed' | 'blocked' | 'failed';
  /** Started at property. */
  startedAt: string;
  /** Finished at property. */
  finishedAt: string;
  /** Summary property. */
  summary: string;
  /** Improved property. */
  improved?: boolean | null;
  /** Selected unit property. */
  unit: PulseAutonomyUnitSnapshot | null;
  /** Directive digest before mutation property. */
  directiveDigestBefore: string | null;
  /** Directive digest after mutation property. */
  directiveDigestAfter: string | null;
  /** Directive state before mutation property. */
  directiveBefore: {
    certificationStatus: string | null;
    blockingTier: number | null;
    score: number | null;
    visionGap: string | null;
    executionMatrixSummary?: PulseExecutionMatrixSummary | null;
  };
  /** Directive state after mutation property. */
  directiveAfter: {
    certificationStatus: string | null;
    blockingTier: number | null;
    score: number | null;
    visionGap: string | null;
    executionMatrixSummary?: PulseExecutionMatrixSummary | null;
  } | null;
  /** Execution matrix snapshot before mutation. */
  executionMatrixSummaryBefore?: PulseExecutionMatrixSummary | null;
  /** Execution matrix snapshot after mutation. */
  executionMatrixSummaryAfter?: PulseExecutionMatrixSummary | null;
  /** Codex execution result property. */
  codex: {
    executed: boolean;
    command: string | null;
    exitCode: number | null;
    finalMessage: string | null;
  };
  /** Validation result property. */
  validation: {
    executed: boolean;
    commands: PulseAutonomyValidationCommandResult[];
  };
}

/** Persisted state for the autonomous Pulse loop. */
export interface PulseAutonomyState {
  /** Generated at property. */
  generatedAt: string;
  /** Status property. */
  status: 'idle' | 'running' | 'blocked' | 'completed' | 'failed';
  /** Orchestration mode property. */
  orchestrationMode: 'single' | 'parallel';
  /** Risk profile property. */
  riskProfile: 'safe' | 'balanced' | 'dangerous';
  /** Planner mode property. */
  plannerMode: 'agents_sdk' | 'deterministic';
  /** Continuous loop property. */
  continuous: boolean;
  /** Max iterations property. */
  maxIterations: number;
  /** Completed iterations property. */
  completedIterations: number;
  /** Parallel agent count property. */
  parallelAgents: number;
  /** Max worker retries property. */
  maxWorkerRetries: number;
  /** Planner model property. */
  plannerModel: string | null;
  /** Codex model property. */
  codexModel: string | null;
  /** Guidance generated at property. */
  guidanceGeneratedAt: string | null;
  /** Current checkpoint property. */
  currentCheckpoint: Record<string, unknown> | null;
  /** Target checkpoint property. */
  targetCheckpoint: Record<string, unknown> | null;
  /** Vision gap property. */
  visionGap: string | null;
  /** Stop reason property. */
  stopReason: string | null;
  /** Next actionable unit property. */
  nextActionableUnit: PulseAutonomyUnitSnapshot | null;
  /** Human required unit count property. */
  humanRequiredUnits: number;
  /** Observation only unit count property. */
  observationOnlyUnits: number;
  /** Runner capability snapshot property. */
  runner: {
    agentsSdkAvailable: boolean;
    agentsSdkVersion: string | null;
    openAiApiKeyConfigured: boolean;
    codexCliAvailable: boolean;
  };
  /** Iteration history property. */
  history: PulseAutonomyIterationRecord[];
}

/** Single worker result inside a parallel agent batch. */
export interface PulseAgentOrchestrationWorkerResult {
  /** Worker ID property. */
  workerId: string;
  /** Attempt count property. */
  attemptCount: number;
  /** Worker status property. */
  status: 'planned' | 'running' | 'validated' | 'completed' | 'failed' | 'blocked';
  /** Summary property. */
  summary: string;
  /** Assigned convergence unit property. */
  unit: PulseAutonomyUnitSnapshot | null;
  /** Started at property. */
  startedAt: string | null;
  /** Finished at property. */
  finishedAt: string | null;
  /** Capability locks property. */
  lockedCapabilities: string[];
  /** Flow locks property. */
  lockedFlows: string[];
  /** Workspace mode property. */
  workspaceMode: 'shared' | 'isolated_copy';
  /** Workspace path property. */
  workspacePath: string | null;
  /** Patch path property. */
  patchPath: string | null;
  /** Changed files property. */
  changedFiles: string[];
  /** Patch apply status property. */
  applyStatus: 'not_applicable' | 'planned' | 'applied' | 'skipped' | 'failed';
  /** Patch apply summary property. */
  applySummary: string | null;
  /** Worker log path property. */
  logPath: string | null;
  /** Codex execution result property. */
  codex: {
    executed: boolean;
    command: string | null;
    exitCode: number | null;
    finalMessage: string | null;
  };
}

/** Single orchestration batch record. */
export interface PulseAgentOrchestrationBatchRecord {
  /** Batch number property. */
  batch: number;
  /** Strategy property. */
  strategy: 'capability_flow_locking';
  /** Risk profile property. */
  riskProfile: 'safe' | 'balanced' | 'dangerous';
  /** Planner mode property. */
  plannerMode: 'agents_sdk' | 'deterministic';
  /** Started at property. */
  startedAt: string;
  /** Finished at property. */
  finishedAt: string;
  /** Summary property. */
  summary: string;
  /** Directive digest before batch property. */
  directiveDigestBefore: string | null;
  /** Directive digest after batch property. */
  directiveDigestAfter: string | null;
  /** Whether batch materially improved Pulse property. */
  improved: boolean;
  /** Worker results property. */
  workers: PulseAgentOrchestrationWorkerResult[];
  /** Validation result property. */
  validation: {
    /** Executed property. */
    executed: boolean;
    /** Commands property. */
    commands: PulseAutonomyValidationCommandResult[];
  };
}

/** Persisted state for manager/worker Codex orchestration. */
export interface PulseAgentOrchestrationState {
  /** Generated at property. */
  generatedAt: string;
  /** Status property. */
  status: 'idle' | 'running' | 'blocked' | 'completed' | 'failed';
  /** Strategy property. */
  strategy: 'capability_flow_locking';
  /** Risk profile property. */
  riskProfile: 'safe' | 'balanced' | 'dangerous';
  /** Planner mode property. */
  plannerMode: 'agents_sdk' | 'deterministic';
  /** Continuous loop property. */
  continuous: boolean;
  /** Max iterations property. */
  maxIterations: number;
  /** Completed iterations property. */
  completedIterations: number;
  /** Parallel agent count property. */
  parallelAgents: number;
  /** Max worker retries property. */
  maxWorkerRetries: number;
  /** Guidance generated at property. */
  guidanceGeneratedAt: string | null;
  /** Current checkpoint property. */
  currentCheckpoint: Record<string, unknown> | null;
  /** Target checkpoint property. */
  targetCheckpoint: Record<string, unknown> | null;
  /** Vision gap property. */
  visionGap: string | null;
  /** Stop reason property. */
  stopReason: string | null;
  /** Next batch units property. */
  nextBatchUnits: PulseAutonomyUnitSnapshot[];
  /** Runner capability snapshot property. */
  runner: {
    agentsSdkAvailable: boolean;
    agentsSdkVersion: string | null;
    openAiApiKeyConfigured: boolean;
    codexCliAvailable: boolean;
  };
  /** Batch history property. */
  history: PulseAgentOrchestrationBatchRecord[];
}

/** Persisted autonomy concept type. */
export type PulseAutonomyConceptType =
  | 'repeated_stall'
  | 'validation_failure'
  | 'execution_failure'
  | 'oversized_unit';

/** Persisted autonomy strategy type. */
export type PulseAutonomySuggestedStrategy =
  | 'narrow_scope'
  | 'increase_validation'
  | 'retry_in_isolation'
  | 'reduce_parallelism'
  | 'human_escalation';

/** Persistent autonomy concept memory item. */
export interface PulseAutonomyMemoryConcept {
  /** Concept id property. */
  id: string;
  /** Type property. */
  type: PulseAutonomyConceptType;
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Confidence property. */
  confidence: 'low' | 'medium' | 'high';
  /** Recurrence property. */
  recurrence: number;
  /** First seen at property. */
  firstSeenAt: string | null;
  /** Last seen at property. */
  lastSeenAt: string | null;
  /** Unit ids property. */
  unitIds: string[];
  /** Iterations property. */
  iterations: number[];
  /** Suggested strategy property. */
  suggestedStrategy: PulseAutonomySuggestedStrategy;
}

/** Persistent autonomy memory artifact. */
export interface PulseAutonomyMemoryState {
  /** Generated at property. */
  generatedAt: string;
  /** Summary property. */
  summary: {
    totalConcepts: number;
    repeatedStalls: number;
    validationFailures: number;
    executionFailures: number;
    oversizedUnits: number;
  };
  /** Concepts property. */
  concepts: PulseAutonomyMemoryConcept[];
}

// Execution chain and product graph types are in types.product-graph.ts to keep this file under 400 lines
export type {
  PulseExecutionChainStepRole,
  PulseExecutionChainStep,
  PulseExecutionChain,
  PulseExecutionChainSet,
  PulseProductSurface,
  PulseProductCapability,
  PulseProductFlow,
  PulseProductGraph,
} from './types.product-graph';
