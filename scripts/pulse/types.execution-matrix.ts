import type {
  PulseConvergenceExecutionMode,
  PulseConvergenceRiskLevel,
  PulseExecutionChainStepRole,
  PulseFlowProjectionStatus,
  PulseTruthMode,
} from './types';

/** Status assigned to every code-discovered executable path. */
export type PulseExecutionMatrixPathStatus =
  | 'observed_pass'
  | 'observed_fail'
  | 'untested'
  /** Observation-only terminal state for governed evidence gathering. */
  | 'observation_only'
  /** @deprecated Legacy artifact compatibility only. New matrix builds must not emit this. */
  | 'blocked_human_required'
  | 'unreachable'
  | 'inferred_only'
  | 'not_executable';

/** Source class for a matrix path. */
export type PulseExecutionMatrixPathSource =
  | 'execution_chain'
  | 'capability'
  | 'flow'
  | 'structural_node'
  | 'scope_file';

/** Stage where a path passed, failed, or stopped being executable. */
export interface PulseExecutionMatrixBreakpoint {
  /** Stage role in the discovered execution chain. */
  stage: PulseExecutionChainStepRole | 'entrypoint' | 'unknown';
  /** Step index, where 0 is the entrypoint. */
  stepIndex: number;
  /** File path when known. */
  filePath: string | null;
  /** Node id when known. */
  nodeId: string | null;
  /** Route pattern when known. */
  routePattern: string | null;
  /** Human-readable reason. */
  reason: string;
  /** Suggested next verification or repair target. */
  recovery: string;
}

/** Required proof for a matrix path to become observed_pass. */
export interface PulseExecutionMatrixEvidenceRequirement {
  /** Evidence class. */
  kind: 'static' | 'unit' | 'integration' | 'e2e' | 'runtime' | 'external';
  /** Whether this requirement is mandatory for critical path readiness. */
  required: boolean;
  /** Why the requirement exists. */
  reason: string;
}

/** Observed evidence attached to a matrix path. */
export interface PulseExecutionMatrixObservedEvidence {
  /** Evidence source. */
  source: 'runtime' | 'browser' | 'flow' | 'actor' | 'external' | 'static';
  /** Artifact that contains the evidence. */
  artifactPath: string;
  /** Whether the evidence executed in this run/snapshot. */
  executed: boolean;
  /** Evidence status. */
  status: 'passed' | 'failed' | 'missing' | 'skipped' | 'mapped';
  /** Short evidence summary. */
  summary: string;
}

/** One executable or classifiable path in the codebase. */
export interface PulseExecutionMatrixPath {
  /** Stable path id. */
  pathId: string;
  /** Capability id when mapped. */
  capabilityId: string | null;
  /** Flow id when mapped. */
  flowId: string | null;
  /** Source object for the path. */
  source: PulseExecutionMatrixPathSource;
  /** Entrypoint description. */
  entrypoint: {
    nodeId: string | null;
    filePath: string | null;
    routePattern: string | null;
    description: string;
  };
  /** Ordered chain roles. */
  chain: Array<{
    role: PulseExecutionChainStepRole;
    nodeId: string;
    filePath: string | null;
    description: string;
    truthMode: PulseTruthMode;
  }>;
  /** Final classification. */
  status: PulseExecutionMatrixPathStatus;
  /** Strongest truth mode behind the classification. */
  truthMode: PulseTruthMode;
  /** Runtime/product status inherited from capability/flow when available. */
  productStatus: PulseFlowProjectionStatus | null;
  /** Exact place where the path failed or stopped, when applicable. */
  breakpoint: PulseExecutionMatrixBreakpoint | null;
  /** Evidence required to call this path observed_pass. */
  requiredEvidence: PulseExecutionMatrixEvidenceRequirement[];
  /** Evidence actually found. */
  observedEvidence: PulseExecutionMatrixObservedEvidence[];
  /** Minimal validation command or artifact check. */
  validationCommand: string;
  /** Risk of autonomous mutation on this path. */
  risk: PulseConvergenceRiskLevel;
  /** Whether an AI agent may execute remediation. */
  executionMode: PulseConvergenceExecutionMode;
  /** Confidence in the classification. */
  confidence: number;
  /** Files involved in the path. */
  filePaths: string[];
  /** Route patterns involved in the path. */
  routePatterns: string[];
}

/** Aggregate counts for the execution matrix. */
export interface PulseExecutionMatrixSummary {
  /** Total paths discovered. */
  totalPaths: number;
  /** Path counts by source class. */
  bySource: Record<PulseExecutionMatrixPathSource, number>;
  /** Path counts by terminal status. */
  byStatus: Record<PulseExecutionMatrixPathStatus, number>;
  /** Paths with observed passing evidence. */
  observedPass: number;
  /** Paths with observed failing evidence. */
  observedFail: number;
  /** Paths discovered but not executed. */
  untested: number;
  /** Legacy blocked-human count retained for artifact compatibility. New matrix builds should emit zero. */
  blockedHumanRequired: number;
  /** Observation-only paths retained for normalized artifact compatibility. */
  observationOnlyRequired?: number;
  /** Paths with no real entrypoint. */
  unreachable: number;
  /** Paths known only by structural inference. */
  inferredOnly: number;
  /** Paths that are not behaviorally executable. */
  notExecutable: number;
  /** Paths that reached a terminal matrix status. Must match totalPaths. */
  terminalPaths: number;
  /** Paths without a terminal matrix status. Must stay zero. */
  nonTerminalPaths: number;
  /** Paths that remain unknown. Must stay zero. */
  unknownPaths: number;
  /** Critical paths that still lack observed pass/fail evidence. */
  criticalUnobservedPaths: number;
  /** Observed failures without precise breakpoint. Must stay zero. */
  impreciseBreakpoints: number;
  /** Path coverage percentage, 0-100. */
  coveragePercent: number;
}

/** Canonical execution matrix artifact. */
export interface PulseExecutionMatrix {
  /** Generation timestamp. */
  generatedAt: string;
  /** Summary counts. */
  summary: PulseExecutionMatrixSummary;
  /** Classified paths. */
  paths: PulseExecutionMatrixPath[];
}
