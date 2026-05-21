import type { PathProofTask } from '../path-proof-runner/main';

export const PATH_PROOF_TASKS_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_TASKS.json';
export const PATH_PROOF_EVIDENCE_ARTIFACT = '.pulse/current/PULSE_PATH_PROOF_EVIDENCE.json';

export type PathProofRunnerResultStatus =
  | 'pass'
  | 'fail'
  | 'passed'
  | 'failed'
  | 'planned_only'
  | 'skipped'
  | 'stale'
  | 'not_run'
  | 'error';

export interface PathProofRunnerResult {
  taskId: string;
  pathId?: string;
  command: string;
  status: PathProofRunnerResultStatus;
  executed: boolean;
  plannedOnly?: boolean;
  skipped?: boolean;
  stale?: boolean;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  artifactPath?: string;
  summary?: string;
}

export interface PathProofObservedEvidenceLink {
  artifactPath: string;
  relationship: 'observed_evidence';
  command: string;
  status: 'observed_pass' | 'observed_fail';
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  observedAt: string;
  summary: string;
}

export type PathProofEvidenceDisposition =
  | 'observed_pass'
  | 'observed_fail'
  | 'not_run'
  | 'planned_only'
  | 'skipped'
  | 'stale'
  | 'missing_result'
  | 'not_observed';

export type PathProofEvidenceState = 'observed' | 'not_run';

export interface PathProofEvidenceFreshness {
  status: 'fresh' | 'stale' | 'not_run';
  generatedAt: string;
  observedAt: string | null;
  ageMs: number | null;
  reason: string;
}

export interface PathProofEvidenceEntry {
  taskId: string;
  pathId: string;
  capabilityId: string | null;
  flowId: string | null;
  mode: PathProofTask['mode'];
  taskStatus: PathProofTask['status'];
  taskExecuted: false;
  taskCoverageCountsAsObserved: false;
  autonomousExecutionAllowed: boolean;
  command: string;
  expectedEvidence: PathProofTask['expectedEvidence'];
  disposition: PathProofEvidenceDisposition;
  evidenceState: PathProofEvidenceState;
  observed: boolean;
  coverageCountsAsObserved: boolean;
  freshness: PathProofEvidenceFreshness;
  reason: string;
  result: PathProofRunnerResult | null;
  observedEvidenceLink: PathProofObservedEvidenceLink | null;
}

export interface PathProofEvidenceArtifact {
  artifact: 'PULSE_PATH_PROOF_EVIDENCE';
  artifactVersion: 1;
  generatedAt: string;
  sourceArtifacts: {
    tasks: typeof PATH_PROOF_TASKS_ARTIFACT;
    self: typeof PATH_PROOF_EVIDENCE_ARTIFACT;
  };
  summary: {
    totalTasks: number;
    runnerResults: number;
    observedEvidenceLinks: number;
    observedPass: number;
    observedFail: number;
    notRun: number;
    plannedOnly: number;
    skipped: number;
    stale: number;
    missingResult: number;
    notObserved: number;
    commandlessResults: number;
    executableTasks: number;
    humanRequiredTasks: number;
    notExecutableTasks: number;
  };
  tasks: PathProofEvidenceEntry[];
}

export interface BuildPathProofEvidenceInput {
  plan?: import('../path-proof-runner/main').PathProofPlan;
  runnerResults?: PathProofRunnerResult[];
  generatedAt?: string;
  writeArtifact?: boolean;
}
