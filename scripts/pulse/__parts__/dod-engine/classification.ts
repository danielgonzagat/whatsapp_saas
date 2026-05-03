import type { DoDGate, DoDRiskLevel, DoDCapabilityClassification } from '../../types.dod-engine';
import { isInferredTruthMode, isEmptyCollection } from './helpers';
import { structuralEvidenceProfile } from './structural-checks';

export function classifyCapability(
  structuralChecks: Record<string, boolean>,
  gates: DoDGate[],
  riskLevel: DoDRiskLevel,
  truthMode: string,
  requiredBeforeReal: string[],
): DoDCapabilityClassification {
  const allRequiredPass = gates.filter((g) => g.required).every((g) => g.status === 'pass');

  const runtimeObserved = gates.find((g) => g.name === 'runtime_observed')?.status === 'pass';
  const blockingPass = gates.every((g) => !g.blocking || g.status !== 'fail');

  const structuralProfile = structuralEvidenceProfile(structuralChecks, riskLevel);

  // phantom: truth mode is inferred with no structural backing
  if (isInferredTruthMode(truthMode) && !structuralProfile.hasAnyEvidence) {
    return 'phantom';
  }

  // production: all blocking + required gates pass AND structural checks complete
  if (
    allRequiredPass &&
    blockingPass &&
    structuralProfile.hasCompleteEvidence &&
    runtimeObserved &&
    isEmptyCollection(requiredBeforeReal)
  ) {
    return 'production';
  }

  // real: enough structural evidence AND runtime observed
  if (
    structuralProfile.hasMajorityEvidence &&
    runtimeObserved &&
    isEmptyCollection(requiredBeforeReal)
  ) {
    return 'real';
  }

  // latent: some structural evidence (but not enough for real)
  if (structuralProfile.hasAnyEvidence) {
    return 'latent';
  }

  // phantom: minimal structural evidence
  return 'phantom';
}
