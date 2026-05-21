import type { PulseExecutionMatrixPath } from '../types.execution-matrix';
import type {
  PathCoverageExpectedEvidence,
} from '../types.path-coverage-engine';

export type PathProofTaskMode =
  | 'endpoint'
  | 'ui'
  | 'worker'
  | 'webhook'
  | 'function'
  | 'not_executable'
  | 'human_required';

export interface PathProofTaskArtifactLink {
  artifactPath: string;
  relationship:
    | 'source_matrix'
    | 'coverage_state'
    | 'probe_blueprint'
    | 'observed_evidence'
    | 'proof_task_plan';
}

export interface PathProofTask {
  taskId: string;
  pathId: string;
  capabilityId: string | null;
  flowId: string | null;
  mode: PathProofTaskMode;
  status: 'planned';
  executed: false;
  coverageCountsAsObserved: false;
  autonomousExecutionAllowed: boolean;
  command: string;
  reason: string;
  sourceStatus: PulseExecutionMatrixPath['status'];
  risk: PulseExecutionMatrixPath['risk'];
  entrypoint: PulseExecutionMatrixPath['entrypoint'];
  breakpoint: PulseExecutionMatrixPath['breakpoint'];
  expectedEvidence: PathCoverageExpectedEvidence[];
  artifactLinks: PathProofTaskArtifactLink[];
}

export interface PathProofPlan {
  generatedAt: string;
  summary: {
    terminalWithoutObservedEvidence: number;
    plannedTasks: number;
    executableTasks: number;
    humanRequiredTasks: number;
    notExecutableTasks: number;
  };
  tasks: PathProofTask[];
}

export interface BuildPathProofPlanInput {
  matrix?: import('../types.execution-matrix').PulseExecutionMatrix;
  pathCoverage?: import('../types.path-coverage-engine').PathCoverageState;
  generatedAt?: string;
  writeArtifact?: boolean;
}
