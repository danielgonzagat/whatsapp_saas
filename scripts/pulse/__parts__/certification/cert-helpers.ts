import type {
  PulseCertificationTarget,
  PulseActorEvidence,
  PulseCodacyEvidence,
  PulseCapabilityState,
  PulseExecutionEvidence,
  PulseExternalSignalState,
  PulseExecutionMatrix,
  PulseFlowProjection,
  PulseGateName,
  PulseGateResult,
  PulseHealth,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParserInventory,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
  PulseCodebaseTruth,
  PulseSelfTrustReport,
} from '../../types';

import type {
  PulseDirectiveSnapshot,
  PulseCertificateSnapshot,
  PulseProofReadinessSummary,
} from '../../cert-gate-overclaim';

import type { PulseAutonomyStateSnapshot } from '../../cert-gate-multi-cycle';
import type { PulsePathCoverageGateState } from '../../cert-gate-execution-matrix';

import { pathExists, readJsonFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  PROOF_READINESS_ARTIFACT,
  refreshProofReadinessArtifact,
  type ProofReadinessArtifact,
} from '../../proof-readiness-artifact';
import { evaluateActorGate } from '../../cert-gate-evaluators-actor';
import type { PulseNoHardcodedRealitySummary } from '../../no-hardcoded-reality-state';

export const NO_HARDCODED_REALITY_ARTIFACT = 'PULSE_NO_HARDCODED_REALITY.json';

export interface GateBuildContext {
  env: string;
  manifest: PulseManifest | null;
  certificationTarget: PulseCertificationTarget;
  certificationTiers: PulseManifest['certificationTiers'];
  pathCoverage: PulsePathCoverageGateState | null;
  proofReadinessSummary: PulseProofReadinessSummary | undefined;
  productionProofReadinessGap: boolean;
  noHardcodedRealityGap: boolean;
  noHardcodedRealitySummary: PulseNoHardcodedRealitySummary;
  multiCycleConvergenceResult: PulseGateResult;
  evidenceSummary: PulseExecutionEvidence;
  gateEvidence: Partial<Record<PulseGateName, unknown[]>>;
}

export interface ComputeCertificationInput {
  rootDir: string;
  manifestResult: PulseManifestLoadResult;
  parserInventory: PulseParserInventory;
  health: PulseHealth;
  codebaseTruth: PulseCodebaseTruth;
  resolvedManifest: PulseResolvedManifest;
  scopeState: PulseScopeState;
  codacyEvidence?: PulseCodacyEvidence;
  structuralGraph?: PulseStructuralGraph;
  capabilityState?: PulseCapabilityState;
  flowProjection?: PulseFlowProjection;
  externalSignalState?: PulseExternalSignalState;
  executionMatrix?: PulseExecutionMatrix;
  executionEvidence?: Partial<PulseExecutionEvidence>;
  certificationTarget?: PulseCertificationTarget;
  productVision?: unknown;
  previousDirective?: PulseDirectiveSnapshot | null;
  previousCertificate?: PulseCertificateSnapshot | null;
  autonomyState?: PulseAutonomyStateSnapshot | null;
  selfTrustReport?: PulseSelfTrustReport | null;
}

export function loadPathCoverageGateState(rootDir: string): PulsePathCoverageGateState | null {
  const filePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_PATH_COVERAGE.json');
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    return readJsonFile<PulsePathCoverageGateState>(filePath);
  } catch {
    return null;
  }
}

export function loadProofReadinessSummary(rootDir: string): PulseProofReadinessSummary | undefined {
  try {
    const refreshedArtifact = refreshProofReadinessArtifact(rootDir);
    if (refreshedArtifact) {
      return refreshedArtifact.summary;
    }
  } catch {
    return undefined;
  }

  const filePath = safeJoin(rootDir, PROOF_READINESS_ARTIFACT);
  if (!pathExists(filePath)) {
    return undefined;
  }

  try {
    const artifact = readJsonFile<ProofReadinessArtifact>(filePath);
    return artifact.summary;
  } catch {
    return undefined;
  }
}

export function findTierForGate(
  certificationTiers: PulseManifest['certificationTiers'],
  gateName: PulseGateName,
): number | null {
  const tier = certificationTiers.find((item) => item.gates.includes(gateName));
  return tier?.id ?? null;
}

export function certificationTargetRequiresGate(
  certificationTarget: PulseCertificationTarget,
  certificationTiers: PulseManifest['certificationTiers'],
  gateName: PulseGateName,
  gateEvidence?: Partial<Record<PulseGateName, unknown[]>>,
): boolean {
  const gateTier = findTierForGate(certificationTiers, gateName);
  if (gateTier === null) {
    const hasEvidence = (gateEvidence?.[gateName] ?? []).length > 0;
    return hasEvidence && (certificationTarget.final || certificationTarget.tier !== null);
  }
  const requestedTier = certificationTarget.tier;
  return (
    Boolean(certificationTarget.final) || (requestedTier !== null && gateTier <= requestedTier)
  );
}

export function evaluateActorGateForCurrentObjective(
  gateName: PulseGateName,
  label: PulseActorEvidence['actorKind'],
  evidence: PulseActorEvidence,
  certificationTarget: PulseCertificationTarget,
  certificationTiers: PulseManifest['certificationTiers'],
  gateEvidence: Partial<Record<PulseGateName, unknown[]>>,
): PulseGateResult {
  const requiresCriticalExecution = certificationTargetRequiresGate(
    certificationTarget,
    certificationTiers,
    gateName,
    gateEvidence,
  );
  if (!evidence.declared.some(Boolean) && requiresCriticalExecution) {
    return {
      status: 'pass',
      reason: `${label} actor evidence is outside the current certification objective because the resolved evidence bundle declared no ${label} scenarios.`,
    };
  }
  return evaluateActorGate(label, evidence, requiresCriticalExecution);
}
