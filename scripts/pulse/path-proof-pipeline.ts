import {
  PATH_PROOF_EVIDENCE_ARTIFACT,
  buildPathProofEvidenceArtifact,
  type PathProofEvidenceArtifact,
  type PathProofEvidenceDisposition,
  type PathProofEvidenceEntry,
  type PathProofRunnerResult,
} from './path-proof-evidence';
import type { PathProofPlan } from './path-proof-runner';
import {
  buildProofReadinessGateInput,
  evaluateProofReadinessGate,
  type ProofReadinessEvidenceSummary,
  type ProofReadinessGateResult,
} from './proof-readiness-gate';

export interface BuildPathProofPipelineInput {
  plan: PathProofPlan;
  runnerResults?: PathProofRunnerResult[];
  generatedAt?: string;
}

export interface PathProofPipelineResult {
  evidenceArtifact: PathProofEvidenceArtifact;
  readinessGate: ProofReadinessGateResult;
}

function statusForDisposition(disposition: PathProofEvidenceDisposition): string {
  if (disposition === 'observed_pass' || disposition === 'observed_fail') {
    return disposition;
  }
  return disposition;
}

function evidenceModeFor(entry: PathProofEvidenceEntry): 'observed' | 'planned' {
  return entry.observedEvidenceLink ? 'observed' : 'planned';
}

function attemptsFor(entry: PathProofEvidenceEntry): number {
  return entry.observedEvidenceLink ? 1 : 0;
}

function artifactPathsFor(entry: PathProofEvidenceEntry): string[] {
  const artifactPaths = [
    entry.observedEvidenceLink?.artifactPath,
    entry.result?.artifactPath,
    PATH_PROOF_EVIDENCE_ARTIFACT,
  ].filter((artifactPath): artifactPath is string => Boolean(artifactPath));

  return [...new Set(artifactPaths)];
}

function readinessEvidenceForEntry(entry: PathProofEvidenceEntry): ProofReadinessEvidenceSummary {
  return {
    id: entry.taskId,
    taskId: entry.taskId,
    pathId: entry.pathId,
    sourceArtifact: entry.observedEvidenceLink?.artifactPath ?? PATH_PROOF_EVIDENCE_ARTIFACT,
    status: statusForDisposition(entry.disposition),
    evidenceMode: evidenceModeFor(entry),
    executed: entry.observed,
    attempts: attemptsFor(entry),
    executionTimeMs: entry.result?.durationMs,
    exitCode: entry.result?.exitCode,
    startedAt: entry.result?.startedAt ?? null,
    finishedAt: entry.result?.finishedAt ?? null,
    artifactPaths: artifactPathsFor(entry),
    summary: entry.reason,
  };
}

export function buildPathProofPipeline(
  input: BuildPathProofPipelineInput,
): PathProofPipelineResult {
  const evidenceArtifact = buildPathProofEvidenceArtifact('.', {
    plan: input.plan,
    runnerResults: input.runnerResults ?? [],
    generatedAt: input.generatedAt,
    writeArtifact: false,
  });
  const readinessEvidence = evidenceArtifact.tasks.map(readinessEvidenceForEntry);
  const readinessGate = evaluateProofReadinessGate(
    buildProofReadinessGateInput(input.plan.tasks, readinessEvidence),
  );

  return {
    evidenceArtifact,
    readinessGate,
  };
}
