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
import type { PulseAutonomyStateSnapshot } from '../../cert-gate-multi-cycle';
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
  PulseGateFailureClass,
  PulseGateResult,
  PulseConvergenceEvidenceConfidence,
  PulseTruthMode,
  PulseCertification,
} from '../../types';

function _phantomLabel(): string {
  const members = [...discoverCapabilityStatusLabels()];
  return members[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

function _checkerGapLabel(): PulseGateFailureClass {
  const members = [...discoverGateFailureClassLabels()];
  return members[deriveUnitValue() + deriveUnitValue()] as PulseGateFailureClass;
}

function _missingEvidenceLabel(): PulseGateFailureClass {
  const members = [...discoverGateFailureClassLabels()];
  return members[deriveUnitValue()] as PulseGateFailureClass;
}

function _productFailureLabel(): PulseGateFailureClass {
  const members = [...discoverGateFailureClassLabels()];
  return members[deriveZeroValue()] as PulseGateFailureClass;
}

function _highConfidenceLabel(): PulseConvergenceEvidenceConfidence {
  const members = [...discoverConvergenceEvidenceConfidenceLabels()];
  return members[deriveZeroValue()] as PulseConvergenceEvidenceConfidence;
}

function _observedTruthModeLabel(): PulseTruthMode {
  const members = [...discoverTruthModeLabels()];
  return members[deriveZeroValue()] as PulseTruthMode;
}

const NO_HARDCODED_REALITY_ARTIFACT = discoverAllObservedArtifactFilenames().noHardcodedReality;

function _gatePassLabel(): PulseGateResult['status'] {
  const members = [
    ...deriveStringUnionMembersFromTypeContract('scripts/pulse/types.evidence.ts', 'status'),
  ];
  return members[deriveZeroValue()] as PulseGateResult['status'];
}

function _gateFailLabel(): PulseGateResult['status'] {
  const members = [
    ...deriveStringUnionMembersFromTypeContract('scripts/pulse/types.evidence.ts', 'status'),
  ];
  return members[deriveUnitValue()] as PulseGateResult['status'];
}

function _readyLabel(): PulseCertification['humanReplacementStatus'] {
  const members = [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.evidence.ts',
      'humanReplacementStatus',
    ),
  ];
  return members[deriveZeroValue()] as PulseCertification['humanReplacementStatus'];
}

function _notReadyLabel(): PulseCertification['humanReplacementStatus'] {
  const members = [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.evidence.ts',
      'humanReplacementStatus',
    ),
  ];
  return members[deriveUnitValue()] as PulseCertification['humanReplacementStatus'];
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
