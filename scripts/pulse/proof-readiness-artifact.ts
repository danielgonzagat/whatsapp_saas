import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { safeJoin } from './safe-path';
import {
  PATH_PROOF_EVIDENCE_ARTIFACT,
  PATH_PROOF_TASKS_ARTIFACT,
  type PathProofEvidenceArtifact,
  type PathProofEvidenceEntry,
} from './path-proof-evidence';
import type { PathProofPlan } from './path-proof-runner';
import {
  buildProofReadinessGateInput,
  evaluateProofReadinessGate,
  type ProofReadinessEvidenceSummary,
  type ProofReadinessGateResult,
} from './proof-readiness-gate';

export const PROOF_READINESS_ARTIFACT = '.pulse/current/PULSE_PROOF_READINESS.json';

export interface ProofReadinessArtifact {
  artifact: 'PULSE_PROOF_READINESS';
  artifactVersion: 1;
  generatedAt: string;
  sourceArtifacts: {
    tasks: typeof PATH_PROOF_TASKS_ARTIFACT;
    evidence: typeof PATH_PROOF_EVIDENCE_ARTIFACT;
    self: typeof PROOF_READINESS_ARTIFACT;
  };
  summary: ProofReadinessGateResult['summary'] & {
    canAdvance: boolean;
    status: ProofReadinessGateResult['status'];
    plannedOrUnexecutedEvidence: number;
  };
  readinessGate: ProofReadinessGateResult;
}

export interface BuildProofReadinessArtifactInput {
  plan?: PathProofPlan;
  evidenceArtifact?: PathProofEvidenceArtifact;
  generatedAt?: string;
  writeArtifact?: boolean;
}

type PathProofReadinessStatus =
  | 'observed_pass'
  | 'observed_fail'
  | 'planned'
  | 'inferred'
  | 'not_available';

function pathProofReadinessStatus(entry: PathProofEvidenceEntry): PathProofReadinessStatus {
  if (entry.disposition === 'observed_pass') {
    return 'observed_pass';
  }
  if (entry.disposition === 'observed_fail') {
    return 'observed_fail';
  }
  if (entry.mode === 'human_required' || entry.mode === 'not_executable') {
    return 'not_available';
  }
  if (entry.disposition === 'planned_only' || entry.disposition === 'missing_result') {
    return 'planned';
  }
  if (entry.disposition === 'not_run') {
    return 'inferred';
  }
  return 'not_available';
}

function pathProofReadinessMode(
  entry: PathProofEvidenceEntry,
): 'observed' | 'planned' | 'inferred' | 'not_available' {
  if (entry.observed && entry.coverageCountsAsObserved) {
    return 'observed';
  }
  if (entry.mode === 'human_required' || entry.mode === 'not_executable') {
    return 'not_available';
  }
  if (entry.disposition === 'planned_only' || entry.disposition === 'missing_result') {
    return 'planned';
  }
  if (entry.disposition === 'not_run') {
    return 'inferred';
  }
  return 'not_available';
}

function pathProofReadinessArtifactPaths(entry: PathProofEvidenceEntry): string[] {
  const artifactPaths = [
    entry.observedEvidenceLink?.artifactPath,
    entry.result?.artifactPath,
    PATH_PROOF_EVIDENCE_ARTIFACT,
  ].filter((artifactPath): artifactPath is string => Boolean(artifactPath));

  return [...new Set(artifactPaths)];
}

export function pathProofEntryToReadinessEvidence(
  entry: PathProofEvidenceEntry,
): ProofReadinessEvidenceSummary {
  const executed = entry.result?.executed === true && entry.observed;
  const status = pathProofReadinessStatus(entry);

  return {
    id: entry.taskId,
    taskId: entry.taskId,
    pathId: entry.pathId,
    sourceArtifact: PATH_PROOF_EVIDENCE_ARTIFACT,
    status,
    evidenceMode: pathProofReadinessMode(entry),
    executed,
    attempts: executed ? 1 : 0,
    exitCode: entry.result?.exitCode,
    startedAt: entry.result?.startedAt ?? null,
    finishedAt: entry.result?.finishedAt ?? null,
    artifactPaths: pathProofReadinessArtifactPaths(entry),
    summary: entry.reason,
  };
}

function plannedOrUnexecutedEvidenceCount(evidence: ProofReadinessEvidenceSummary[]): number {
  return evidence.filter((entry) => entry.executed !== true || entry.evidenceMode !== 'observed')
    .length;
}

function readPathProofPlan(rootDir: string): PathProofPlan {
  return readJsonFile<PathProofPlan>(safeJoin(rootDir, PATH_PROOF_TASKS_ARTIFACT));
}

function readPathProofEvidence(rootDir: string): PathProofEvidenceArtifact {
  return readJsonFile<PathProofEvidenceArtifact>(safeJoin(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT));
}

export function pathProofReadinessInputsExist(rootDir: string): boolean {
  return (
    pathExists(safeJoin(rootDir, PATH_PROOF_TASKS_ARTIFACT)) &&
    pathExists(safeJoin(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT))
  );
}

export function refreshProofReadinessArtifact(rootDir: string): ProofReadinessArtifact | null {
  if (!pathProofReadinessInputsExist(rootDir)) {
    return null;
  }
  return buildProofReadinessArtifact(rootDir);
}

export function buildProofReadinessArtifact(
  rootDir: string,
  input: BuildProofReadinessArtifactInput = {},
): ProofReadinessArtifact {
  const plan = input.plan ?? readPathProofPlan(rootDir);
  const evidenceArtifact = input.evidenceArtifact ?? readPathProofEvidence(rootDir);
  const evidence = evidenceArtifact.tasks.map(pathProofEntryToReadinessEvidence);
  const readinessGate = evaluateProofReadinessGate(
    buildProofReadinessGateInput(plan.tasks, evidence),
  );

  const artifact: ProofReadinessArtifact = {
    artifact: 'PULSE_PROOF_READINESS',
    artifactVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceArtifacts: {
      tasks: PATH_PROOF_TASKS_ARTIFACT,
      evidence: PATH_PROOF_EVIDENCE_ARTIFACT,
      self: PROOF_READINESS_ARTIFACT,
    },
    summary: {
      ...readinessGate.summary,
      canAdvance: readinessGate.canAdvance,
      status: readinessGate.status,
      plannedOrUnexecutedEvidence: plannedOrUnexecutedEvidenceCount(evidence),
    },
    readinessGate,
  };

  if (input.writeArtifact ?? true) {
    ensureDir(safeJoin(rootDir, '.pulse', 'current'), { recursive: true });
    writeTextFile(
      safeJoin(rootDir, PROOF_READINESS_ARTIFACT),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }

  return artifact;
}
