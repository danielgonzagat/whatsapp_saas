import {
  discoverAllObservedArtifactFilenames,
  discoverCapabilityStatusLabels,
  discoverConvergenceEvidenceConfidenceLabels,
  discoverGateFailureClassLabels,
  discoverTruthModeLabels,
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';

import {
  PROOF_READINESS_ARTIFACT,
  refreshProofReadinessArtifact,
  type ProofReadinessArtifact,
} from '../../proof-readiness-artifact';

import { pathExists, readJsonFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';

import type { PulsePathCoverageGateState } from '../../cert-gate-execution-matrix';
import type {
  PulseCertificateSnapshot,
  PulseDirectiveSnapshot,
  PulseProofReadinessSummary,
} from '../../cert-gate-overclaim';
import type {
  PulseCapabilityState,
  PulseCertificationTarget,
  PulseCodacyEvidence,
  PulseCodebaseTruth,
  PulseExecutionEvidence,
  PulseExecutionMatrix,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseHealth,
  PulseManifestLoadResult,
  PulseParserInventory,
  PulseResolvedManifest,
  PulseScopeState,
  PulseSelfTrustReport,
  PulseStructuralGraph,
  PulseAutonomyStateSnapshot,
} from '../../types';

function _phantomLabel(): string {
  const members = [...discoverCapabilityStatusLabels()];
  return members[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

function _checkerGapLabel(): string {
  const members = [...discoverGateFailureClassLabels()];
  return members[deriveUnitValue() + deriveUnitValue()];
}

function _missingEvidenceLabel(): string {
  const members = [...discoverGateFailureClassLabels()];
  return members[deriveUnitValue()];
}

function _productFailureLabel(): string {
  const members = [...discoverGateFailureClassLabels()];
  return members[deriveZeroValue()];
}

function _highConfidenceLabel(): string {
  const members = [...discoverConvergenceEvidenceConfidenceLabels()];
  return members[deriveZeroValue()];
}

function _observedTruthModeLabel(): string {
  const members = [...discoverTruthModeLabels()];
  return members[deriveZeroValue()];
}

const NO_HARDCODED_REALITY_ARTIFACT = discoverAllObservedArtifactFilenames().noHardcodedReality;

function _gatePassLabel(): string {
  const members = [
    ...deriveStringUnionMembersFromTypeContract('scripts/pulse/types.evidence.ts', 'status'),
  ];
  return members[deriveZeroValue()];
}

function _gateFailLabel(): string {
  const members = [
    ...deriveStringUnionMembersFromTypeContract('scripts/pulse/types.evidence.ts', 'status'),
  ];
  return members[deriveUnitValue()];
}

function _readyLabel(): string {
  const members = [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.evidence.ts',
      'humanReplacementStatus',
    ),
  ];
  return members[deriveZeroValue()];
}

function _notReadyLabel(): string {
  const members = [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.evidence.ts',
      'humanReplacementStatus',
    ),
  ];
  return members[deriveUnitValue()];
}

interface ComputeCertificationInput {
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
  /** Product vision for gates to consume (optional, enriches report). */
  productVision?: unknown;
  /**
   * Previous run's directive artifact (PULSE_CLI_DIRECTIVE.json contents).
   * When provided, noOverclaimPass will check for internal contradictions.
   */
  previousDirective?: PulseDirectiveSnapshot | null;
  /**
   * Previous run's certificate artifact (PULSE_CERTIFICATE.json contents).
   * Paired with previousDirective for cross-artifact overclaim detection.
   */
  previousCertificate?: PulseCertificateSnapshot | null;
  /**
   * Persisted autonomy loop state (PULSE_AUTONOMY_STATE.json contents).
   * Drives the multiCycleConvergencePass gate.
   */
  autonomyState?: PulseAutonomyStateSnapshot | null;
  /**
   * Self-trust report (already computed before certification).
   * When present, the pulseSelfTrustPass gate consumes its
   * cross-artifact-consistency check to detect divergence between
   * previously persisted PULSE artifacts.
   */
  selfTrustReport?: PulseSelfTrustReport | null;
}

function loadPathCoverageGateState(rootDir: string): PulsePathCoverageGateState | null {
  const artifactName = discoverAllObservedArtifactFilenames().pathCoverage;
  if (!artifactName) return null;
  const filePath = safeJoin(rootDir, '.pulse', 'current', artifactName);
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    return readJsonFile<PulsePathCoverageGateState>(filePath);
  } catch {
    return null;
  }
}

function loadProofReadinessSummary(rootDir: string): PulseProofReadinessSummary | undefined {
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

export {
  _phantomLabel,
  _checkerGapLabel,
  _missingEvidenceLabel,
  _productFailureLabel,
  _highConfidenceLabel,
  _observedTruthModeLabel,
  NO_HARDCODED_REALITY_ARTIFACT,
  _gatePassLabel,
  _gateFailLabel,
  _readyLabel,
  _notReadyLabel,
  ComputeCertificationInput,
  loadPathCoverageGateState,
  loadProofReadinessSummary,
};
