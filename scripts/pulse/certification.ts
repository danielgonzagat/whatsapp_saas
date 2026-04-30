import type {
  PulseCertification,
  PulseActorEvidence,
  PulseCertificationTarget,
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
} from './types';

import {
  getEnvironment,
  getCertificationTarget,
  getCertificationTiers,
  getFinalReadinessCriteria,
  getCommitSha,
  getActiveTemporaryAcceptances,
  getAcceptedCriticalFlows,
  getPendingCriticalScenarios,
  worldStateHasPendingCriticalExpectations,
  unique,
  filterCodacyIssues,
  isCodacySecurityIssue,
  isCodacyIsolationIssue,
  deriveGateOrderFromResults,
} from './cert-helpers';

import { CERTIFICATION_FINDING_PREDICATES } from './cert-constants';

import {
  gateFail,
  evaluateEvidenceFreshGate,
  evaluateScopeGate,
  evaluateTruthExtractionGate,
  evaluatePulseSelfTrustGate,
  evaluateStaticGate,
  evaluateRuntimeGate,
  evaluateChangeRiskGate,
  evaluateBrowserGate,
} from './cert-gate-evaluators';

import {
  evaluatePatternGate,
  evaluateProductionDecisionGate,
  evaluateRecoveryGate,
  evaluateObservabilityGate,
  withTemporaryGateAcceptance,
} from './cert-gate-pattern';

import {
  evaluateFlowGate,
  evaluateInvariantGate,
  evaluateActorGate,
  evaluateSyntheticCoverageGate,
  computeScore,
  buildTierStatuses,
  getBlockingTier,
} from './cert-gate-evaluators-actor';

import { buildDefaultEvidence, mergeExecutionEvidence } from './cert-evidence-defaults';
import { buildGateEvidence } from './cert-gate-evidence';
import {
  evaluateNoOverclaimGate,
  formatProofReadinessGap,
  hasProductionProofReadinessGap,
  type PulseDirectiveSnapshot,
  type PulseCertificateSnapshot,
  type PulseProofReadinessSummary,
} from './cert-gate-overclaim';
import {
  PROOF_READINESS_ARTIFACT,
  refreshProofReadinessArtifact,
  type ProofReadinessArtifact,
} from './proof-readiness-artifact';
import {
  evaluateMultiCycleConvergenceGate,
  REQUIRED_NON_REGRESSING_CYCLES,
  type PulseAutonomyStateSnapshot,
} from './cert-gate-multi-cycle';
import {
  evaluateBreakpointPrecisionGate,
  evaluateCriticalPathObservedGate,
  evaluateExecutionMatrixCompleteGate,
  type PulsePathCoverageGateState,
} from './cert-gate-execution-matrix';
import {
  detectPlaceholderTests,
  detectWeakStatusAssertions,
  detectTypeEscapeHatches,
} from './test-honesty';
import {
  buildPulseNoHardcodedRealityState,
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
} from './no-hardcoded-reality-state';
import { pathExists, readJsonFile } from './safe-fs';
import { safeJoin } from './safe-path';

const NO_HARDCODED_REALITY_ARTIFACT = 'PULSE_NO_HARDCODED_REALITY.json';

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

function findTierForGate(
  certificationTiers: PulseManifest['certificationTiers'],
  gateName: PulseGateName,
): number | null {
  const tier = certificationTiers.find((item) => item.gates.includes(gateName));
  return tier?.id ?? null;
}

function certificationTargetRequiresGate(
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

function evaluateActorGateForCurrentObjective(
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

function deriveCertificationStatus(
  certificationTarget: PulseCertificationTarget,
  foundationsPass: boolean,
  finalReadinessPass: boolean,
  tierStatus: PulseCertification['tierStatus'],
  allPass: boolean,
): PulseCertification['status'] {
  if (!foundationsPass) {
    return 'NOT_CERTIFIED';
  }
  if (certificationTarget.final) {
    return finalReadinessPass ? 'CERTIFIED' : 'PARTIAL';
  }
  if (certificationTarget.tier !== null) {
    const requested = tierStatus.filter((tier) => tier.id <= certificationTarget.tier);
    return requested.every((tier) => tier.status === 'pass') ? 'CERTIFIED' : 'PARTIAL';
  }
  return allPass ? 'CERTIFIED' : 'PARTIAL';
}

function deriveFoundationalGates(
  certificationTiers: PulseManifest['certificationTiers'],
  gateOrder: PulseGateName[],
): PulseGateName[] {
  const firstDeclaredTier = certificationTiers.find((tier) =>
    tier.gates.some((gateName) => gateOrder.includes(gateName)),
  );
  if (!firstDeclaredTier) {
    return [];
  }
  return firstDeclaredTier.gates.filter((gateName) => gateOrder.includes(gateName));
}

function isGateBlockingFinalReadiness(_gateName: PulseGateName, result: PulseGateResult): boolean {
  return (
    result.status === 'fail' &&
    (result.evidenceMode === 'observed' ||
      result.confidence === 'high' ||
      result.failureClass === 'missing_evidence' ||
      result.failureClass === 'checker_gap')
  );
}
