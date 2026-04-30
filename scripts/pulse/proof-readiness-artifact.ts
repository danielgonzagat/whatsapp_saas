import { ensureDir, readJsonFile, writeTextFile } from './safe-fs';
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

function executionStartedAt(entry: PathProofEvidenceEntry): string | null {
  return entry.result?.startedAt ?? null;
}

function executionFinishedAt(entry: PathProofEvidenceEntry): string | null {
  return entry.result?.finishedAt ?? null;
}

function normalizeEvidenceStatus(entry: PathProofEvidenceEntry): string {
  if (entry.disposition === 'observed_pass') {
    return 'observed_pass';
  }
  if (entry.disposition === 'observed_fail') {
    return 'observed_fail';
  }
  return 'planned';
}

function normalizeEvidenceMode(entry: PathProofEvidenceEntry): 'observed' | 'blueprint' {
  return entry.observed && entry.coverageCountsAsObserved ? 'observed' : 'blueprint';
}

function toReadinessEvidence(entry: PathProofEvidenceEntry): ProofReadinessEvidenceSummary {
  const executed = entry.result?.executed === true && entry.observed;

  return {
    id: entry.taskId,
    taskId: entry.taskId,
    pathId: entry.pathId,
    sourceArtifact: PATH_PROOF_EVIDENCE_ARTIFACT,
    status: normalizeEvidenceStatus(entry),
    evidenceMode: normalizeEvidenceMode(entry),
    executed,
    attempts: executed ? 1 : 0,
    exitCode: entry.result?.exitCode,
    startedAt: executionStartedAt(entry),
    finishedAt: executionFinishedAt(entry),
    artifactPaths: entry.observedEvidenceLink ? [entry.observedEvidenceLink.artifactPath] : [],
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

export function buildProofReadinessArtifact(
  rootDir: string,
  input: BuildProofReadinessArtifactInput = {},
): ProofReadinessArtifact {
  const plan = input.plan ?? readPathProofPlan(rootDir);
  const evidenceArtifact = input.evidenceArtifact ?? readPathProofEvidence(rootDir);
  const evidence = evidenceArtifact.tasks.map(toReadinessEvidence);
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
