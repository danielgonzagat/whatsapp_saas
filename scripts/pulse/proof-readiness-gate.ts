import type { PathProofTask, PathProofTaskMode } from './path-proof-runner';
import { classifyExecutionReality } from './execution-reality-audit';
import type {
  PulseExecutionRealityInput,
  PulseExecutionRealityRecord,
} from './types.execution-reality-audit';

export type ProofReadinessGateStatus = 'ready' | 'blocked' | 'executable_unproved';

export interface ProofReadinessTaskSummary {
  taskId: string;
  pathId: string;
  mode: PathProofTaskMode;
  status: 'planned';
  executed: false;
  coverageCountsAsObserved: false;
  autonomousExecutionAllowed: boolean;
}

export interface ProofReadinessEvidenceSummary extends PulseExecutionRealityInput {
  taskId?: string;
  pathId?: string;
}

export interface ProofReadinessGateInput {
  tasks: ProofReadinessTaskSummary[];
  evidence: ProofReadinessEvidenceSummary[];
}

export interface ProofReadinessGateBlocker {
  taskId: string;
  pathId: string;
  mode: PathProofTaskMode;
  reason: 'executable_without_observed_evidence' | 'human_required' | 'not_executable';
}

export interface ProofReadinessGateResult {
  canAdvance: boolean;
  status: ProofReadinessGateStatus;
  summary: {
    totalTasks: number;
    executableTasks: number;
    executableObserved: number;
    executableUnproved: number;
    blockedHumanRequired: number;
    blockedNotExecutable: number;
    observedEvidence: number;
    nonObservedEvidence: number;
  };
  blockers: ProofReadinessGateBlocker[];
  evidence: PulseExecutionRealityRecord[];
}

function isBlockedMode(mode: PathProofTaskMode): boolean {
  return mode === 'human_required' || mode === 'not_executable';
}

function blockerReasonForMode(mode: PathProofTaskMode): ProofReadinessGateBlocker['reason'] | null {
  if (mode === 'human_required') {
    return 'human_required';
  }
  if (mode === 'not_executable') {
    return 'not_executable';
  }
  return null;
}

function evidenceKeys(evidence: ProofReadinessEvidenceSummary): string[] {
  return [evidence.id, evidence.taskId, evidence.pathId].filter((value): value is string =>
    Boolean(value),
  );
}

function hasObservedEvidence(
  task: ProofReadinessTaskSummary,
  observedEvidenceKeys: ReadonlySet<string>,
): boolean {
  return observedEvidenceKeys.has(task.taskId) || observedEvidenceKeys.has(task.pathId);
}

function normalizeTasks(tasks: readonly PathProofTask[]): ProofReadinessTaskSummary[] {
  return tasks.map((task) => ({
    taskId: task.taskId,
    pathId: task.pathId,
    mode: task.mode,
    status: task.status,
    executed: task.executed,
    coverageCountsAsObserved: task.coverageCountsAsObserved,
    autonomousExecutionAllowed: task.autonomousExecutionAllowed,
  }));
}

export function buildProofReadinessGateInput(
  tasks: readonly PathProofTask[],
  evidence: readonly ProofReadinessEvidenceSummary[] = [],
): ProofReadinessGateInput {
  return {
    tasks: normalizeTasks(tasks),
    evidence: [...evidence],
  };
}

export function evaluateProofReadinessGate(
  input: ProofReadinessGateInput,
): ProofReadinessGateResult {
  const evidence = input.evidence.map((record) => classifyExecutionReality(record));
  const observedEvidence = evidence.filter((record) => record.countsAsObservedProof);
  const observedEvidenceKeys = new Set(observedEvidence.flatMap(evidenceKeys));
  const blockers: ProofReadinessGateBlocker[] = [];

  let executableTasks = 0;
  let executableObserved = 0;
  let blockedHumanRequired = 0;
  let blockedNotExecutable = 0;

  for (const task of input.tasks) {
    const blockedReason = blockerReasonForMode(task.mode);
    if (blockedReason) {
      if (blockedReason === 'human_required') {
        blockedHumanRequired += 1;
      } else {
        blockedNotExecutable += 1;
      }
      blockers.push({
        taskId: task.taskId,
        pathId: task.pathId,
        mode: task.mode,
        reason: blockedReason,
      });
      continue;
    }

    if (!task.autonomousExecutionAllowed || isBlockedMode(task.mode)) {
      continue;
    }

    executableTasks += 1;
    if (hasObservedEvidence(task, observedEvidenceKeys)) {
      executableObserved += 1;
      continue;
    }

    blockers.push({
      taskId: task.taskId,
      pathId: task.pathId,
      mode: task.mode,
      reason: 'executable_without_observed_evidence',
    });
  }

  const executableUnproved = executableTasks - executableObserved;
  const canAdvance =
    executableUnproved === 0 && blockedHumanRequired === 0 && blockedNotExecutable === 0;
  const status: ProofReadinessGateStatus = canAdvance
    ? 'ready'
    : executableUnproved > 0
      ? 'executable_unproved'
      : 'blocked';

  return {
    canAdvance,
    status,
    summary: {
      totalTasks: input.tasks.length,
      executableTasks,
      executableObserved,
      executableUnproved,
      blockedHumanRequired,
      blockedNotExecutable,
      observedEvidence: observedEvidence.length,
      nonObservedEvidence: evidence.length - observedEvidence.length,
    },
    blockers,
    evidence,
  };
}
