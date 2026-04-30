import {
  buildPathProofEvidenceArtifact,
  type PathProofEvidenceArtifact,
  type PathProofRunnerResult,
} from './path-proof-evidence';
import type { PathProofPlan } from './path-proof-runner';
import {
  buildProofReadinessGateInput,
  evaluateProofReadinessGate,
  type ProofReadinessGateResult,
} from './proof-readiness-gate';
import { pathProofEntryToReadinessEvidence } from './proof-readiness-artifact';

export interface BuildPathProofPipelineInput {
  plan: PathProofPlan;
  runnerResults?: PathProofRunnerResult[];
  generatedAt?: string;
}

export interface PathProofPipelineResult {
  evidenceArtifact: PathProofEvidenceArtifact;
  readinessGate: ProofReadinessGateResult;
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
  const readinessEvidence = evidenceArtifact.tasks.map(pathProofEntryToReadinessEvidence);
  const readinessGate = evaluateProofReadinessGate(
    buildProofReadinessGateInput(input.plan.tasks, readinessEvidence),
  );

  return {
    evidenceArtifact,
    readinessGate,
  };
}
