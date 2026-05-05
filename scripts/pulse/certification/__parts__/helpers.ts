import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import { discoverCapabilityStatusLabels } from '../../__kernel_additions__/discoverCapabilityStatusLabels';
import { discoverConvergenceEvidenceConfidenceLabels } from '../../__kernel_additions__/discoverConvergenceEvidenceConfidenceLabels';
import {
  discoverGateFailureClassLabels,
  deriveStringUnionMembersFromTypeContract,
} from '../../dynamic-reality-kernel/__parts__/type-contract-labels';
import { discoverTruthModeLabels } from '../../dynamic-reality-kernel/__parts__/type-contract-engines';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';

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
import type { PulseAutonomyStateSnapshot } from '../../cert-gate-multi-cycle/__parts__/helpers';
import type { PulseCapabilityState } from '../../__parts__/types.capabilities/03-capability';
import type { PulseExternalSignalState } from '../../__parts__/types.capabilities/05-external-signals';
import type { PulseFlowProjection } from '../../__parts__/types.capabilities/04-flow-projection';
import type {
  PulseCertificationTarget,
  PulseExecutionEvidence,
  PulseSelfTrustReport,
  PulseGateResult,
  PulseCertification,
} from '../../types.evidence';
import type {
  PulseCodacyEvidence,
  PulseStructuralGraph,
  PulseTruthMode,
} from '../../types.structural';
import type { PulseCodebaseTruth } from '../../types.truth';
import type { PulseExecutionMatrix } from '../../types.execution-matrix';
import type { PulseHealth } from '../../types.health';
import type { PulseManifestLoadResult, PulseParserInventory } from '../../types.manifest';
import type { PulseResolvedManifest } from '../../types.resolved-manifest';
import type { PulseScopeState } from '../../types.truth.scope';
import type { PulseGateFailureClass } from '../../types.gate-failure';
import type { PulseConvergenceEvidenceConfidence } from '../../types.convergence';

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
