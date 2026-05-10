import type {
  PulseCertification,
  PulseGateResult,
} from '../types.evidence';
import type {
  PulseGateName,
  PulseManifest,
} from '../types.manifest';
import type { ComputeCertificationInput } from './helpers';

import {
  _phantomLabel,
  _checkerGapLabel,
  _missingEvidenceLabel,
  _productFailureLabel,
  NO_HARDCODED_REALITY_ARTIFACT,
  _gatePassLabel,
  _gateFailLabel,
  _readyLabel,
  _notReadyLabel,
  loadPathCoverageGateState,
  loadProofReadinessSummary,
} from './helpers';

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
} from '../cert-helpers';

import { CERTIFICATION_FINDING_PREDICATES } from '../cert-constants';

import { gateFail } from '../cert-gate-evaluators/gate-fail';
import {
  evaluateEvidenceFreshGate,
  evaluateScopeGate,
  evaluateStaticGate,
  evaluateRuntimeGate,
  evaluateChangeRiskGate,
} from '../cert-gate-evaluators/main';
import {
  evaluateTruthExtractionGate,
  evaluatePulseSelfTrustGate,
} from '../cert-gate-evaluators/truth-gates';
import { evaluateBrowserGate } from '../cert-gate-browser';

import {
  evaluatePatternGate,
  evaluateProductionDecisionGate,
  evaluateRecoveryGate,
  evaluateObservabilityGate,
  withTemporaryGateAcceptance,
} from '../cert-gate-pattern';

import {
  evaluateFlowGate,
  evaluateInvariantGate,
  evaluateSyntheticCoverageGate,
  computeScore,
  buildTierStatuses,
  getBlockingTier,
} from '../cert-gate-evaluators-actor';

import { buildDefaultEvidence, mergeExecutionEvidence } from '../cert-evidence-defaults';
import { buildGateEvidence } from '../cert-gate-evidence';
import {
  formatProofReadinessGap,
  hasProductionProofReadinessGap,
} from '../cert-gate-overclaim';
import {
  PROOF_READINESS_ARTIFACT,
} from '../proof-readiness-artifact';
import { evaluateMultiCycleConvergenceGate } from '../cert-gate-multi-cycle/core';
import {
  evaluateBreakpointPrecisionGate,
  evaluateCriticalPathObservedGate,
  evaluateExecutionMatrixCompleteGate,
} from '../cert-gate-execution-matrix';
import {
  detectPlaceholderTests,
  detectWeakStatusAssertions,
  detectTypeEscapeHatches,
} from '../test-honesty/main';
import {
  buildPulseNoHardcodedRealityState,
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
} from '../no-hardcoded-reality-state';
import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';

import {
  certificationTargetRequiresGate,
  evaluateActorGateForCurrentObjective,
  deriveCertificationStatus,
  deriveFoundationalGates,
  isGateBlockingFinalReadiness,
} from './compute-helpers';
import { evaluateNoOverclaimPassForCurrentRun } from './compute-gate-evaluation';

export function computeCertification(input: ComputeCertificationInput): PulseCertification {
  const env = getEnvironment();
  const manifest: PulseManifest | null = input.manifestResult.manifest;
  const certificationTarget = getCertificationTarget(input.certificationTarget);
  const certificationTiers = getCertificationTiers(input.resolvedManifest);
  const finalReadinessCriteria = getFinalReadinessCriteria(input.resolvedManifest);
  const timestamp = new Date().toISOString();
  const pathCoverage = loadPathCoverageGateState(input.rootDir);
  const proofReadinessSummary = loadProofReadinessSummary(input.rootDir);
  const productionProofReadinessGap = hasProductionProofReadinessGap(proofReadinessSummary);
  const noHardcodedRealityState = buildPulseNoHardcodedRealityState(input.rootDir, timestamp);
  const noHardcodedRealitySummary = summarizeNoHardcodedRealityState(noHardcodedRealityState);
  const noHardcodedRealityGap = hasNoHardcodedRealityBlocker(noHardcodedRealitySummary);
  const multiCycleConvergenceResult = withTemporaryGateAcceptance(
    'multiCycleConvergencePass',
    manifest,
    evaluateMultiCycleConvergenceGate(input.autonomyState),
  );

  const defaults = buildDefaultEvidence(
    env,
    manifest,
    input.parserInventory,
    input.health,
    input.codebaseTruth,
    input.resolvedManifest,
    certificationTarget,
  );
  const evidenceSummary = mergeExecutionEvidence(defaults, input.executionEvidence);
  const gateEvidence = buildGateEvidence(
    input.health,
    evidenceSummary,
    input.codebaseTruth,
    input.resolvedManifest,
    input.scopeState,
    input.scopeState.codacy,
    input.externalSignalState,
  );
  if (input.executionMatrix) {
    gateEvidence.executionMatrixCompletePass = [
      {
        kind: 'artifact',
        executed: true,
        summary: `Execution matrix classified ${input.executionMatrix.summary.totalPaths} path(s); unknown=${input.executionMatrix.summary.unknownPaths}.`,
        artifactPaths: discoverAllObservedArtifactFilenames().executionMatrix
          ? [discoverAllObservedArtifactFilenames().executionMatrix!]
          : [],
        metrics: {
          totalPaths: input.executionMatrix.summary.totalPaths,
          unknownPaths: input.executionMatrix.summary.unknownPaths,
          coveragePercent: input.executionMatrix.summary.coveragePercent,
        },
      },
    ];
    gateEvidence.criticalPathObservedPass = [
      {
        kind: 'coverage',
        executed: true,
        summary:
          pathCoverage?.summary?.criticalUnobserved &&
          pathCoverage.summary.criticalUnobserved > deriveZeroValue()
            ? `${pathCoverage.summary.criticalUnobserved} critical path(s) remain unobserved in path coverage.`
            : `${input.executionMatrix.summary.criticalUnobservedPaths} critical path(s) lack observed pass/fail evidence.`,
        artifactPaths: (() => {
          const artifacts = discoverAllObservedArtifactFilenames();
          const em = artifacts.executionMatrix;
          const pc = artifacts.pathCoverage;
          return pathCoverage ? ([em, pc].filter(Boolean) as string[]) : em ? [em] : [];
        })(),
        metrics: {
          criticalUnobservedPaths: input.executionMatrix.summary.criticalUnobservedPaths,
          criticalInferredOnlyPaths: pathCoverage?.summary?.criticalInferredOnly ?? 0,
          criticalPathCoverageUnobserved: pathCoverage?.summary?.criticalUnobserved ?? 0,
          pathCoveragePercent: pathCoverage?.summary?.coveragePercent ?? 0,
          observedPass: input.executionMatrix.summary.observedPass,
          observedFail: input.executionMatrix.summary.observedFail,
        },
      },
    ];
    gateEvidence.breakpointPrecisionPass = [
      {
        kind: 'artifact',
        executed: true,
        summary: `${input.executionMatrix.summary.impreciseBreakpoints} observed failure(s) lack precise breakpoints.`,
        artifactPaths: discoverAllObservedArtifactFilenames().executionMatrix
          ? [discoverAllObservedArtifactFilenames().executionMatrix!]
          : [],
        metrics: {
          impreciseBreakpoints: input.executionMatrix.summary.impreciseBreakpoints,
        },
      },
    ];
  }
  if (proofReadinessSummary) {
    gateEvidence.noOverclaimPass = [
      ...(gateEvidence.noOverclaimPass || []),
      {
        kind: 'artifact',
        executed: true,
        summary: productionProofReadinessGap
          ? `Proof readiness blocks completion: ${formatProofReadinessGap(proofReadinessSummary)}.`
          : `Proof readiness is complete: ${formatProofReadinessGap(proofReadinessSummary)}.`,
        artifactPaths: [PROOF_READINESS_ARTIFACT],
        metrics: {
          canAdvance: proofReadinessSummary.canAdvance === true ? 1 : 0,
          plannedEvidence: proofReadinessSummary.plannedEvidence ?? 0,
          plannedOrUnexecutedEvidence: proofReadinessSummary.plannedOrUnexecutedEvidence ?? 0,
          inferredEvidence: proofReadinessSummary.inferredEvidence ?? 0,
          notAvailableEvidence: proofReadinessSummary.notAvailableEvidence ?? 0,
          nonObservedEvidence: proofReadinessSummary.nonObservedEvidence ?? 0,
          executableUnproved: proofReadinessSummary.executableUnproved ?? 0,
          blockedHumanRequired: proofReadinessSummary.blockedHumanRequired ?? 0,
          blockedNotExecutable: proofReadinessSummary.blockedNotExecutable ?? 0,
        },
      },
    ];
  }
  if (noHardcodedRealityGap) {
    gateEvidence.noOverclaimPass = [
      ...(gateEvidence.noOverclaimPass || []),
      {
        kind: 'artifact',
        executed: true,
        summary: `No-hardcoded-reality state blocks completion: ${formatNoHardcodedRealityBlocker(noHardcodedRealitySummary)}`,
        artifactPaths: [NO_HARDCODED_REALITY_ARTIFACT],
        metrics: {
          totalEvents: noHardcodedRealitySummary.totalEvents,
          scannedFiles: noHardcodedRealitySummary.scannedFiles,
        },
      },
    ];
  }

  const gates: Record<PulseGateName, PulseGateResult> = {
    scopeClosed: withTemporaryGateAcceptance(
      'scopeClosed',
      manifest,
      evaluateScopeGate(input.scopeState),
    ),
    adapterSupported:
      input.manifestResult.unsupportedStacks.length === deriveZeroValue()
        ? {
            status: _gatePassLabel(),
            reason: 'All declared stack adapters are supported by the current PULSE foundation.',
          }
        : withTemporaryGateAcceptance(
            'adapterSupported',
            manifest,
            gateFail(
              `Unsupported adapters declared in manifest: ${input.manifestResult.unsupportedStacks.join(', ')}.`,
              _checkerGapLabel(),
            ),
          ),
    specComplete:
      input.manifestResult.manifest !== null &&
      input.manifestResult.issues.length === deriveZeroValue()
        ? {
            status: _gatePassLabel(),
            reason: 'pulse.manifest.json is present and passed structural validation.',
          }
        : withTemporaryGateAcceptance(
            'specComplete',
            manifest,
            gateFail(
              input.manifestResult.issues.map((issue) => issue.description).join(' ') ||
                'pulse.manifest.json is missing or invalid.',
              _checkerGapLabel(),
            ),
          ),
    truthExtractionPass: withTemporaryGateAcceptance(
      'truthExtractionPass',
      manifest,
      evaluateTruthExtractionGate(
        input.codebaseTruth,
        input.resolvedManifest,
        input.scopeState,
        input.capabilityState,
        input.flowProjection,
      ),
    ),
    staticPass: withTemporaryGateAcceptance(
      'staticPass',
      manifest,
      evaluateStaticGate(input.health, manifest, input.scopeState.codacy),
    ),
    runtimePass: withTemporaryGateAcceptance(
      'runtimePass',
      manifest,
      evaluateRuntimeGate(env, evidenceSummary, input.externalSignalState),
    ),
    changeRiskPass: withTemporaryGateAcceptance(
      'changeRiskPass',
      manifest,
      evaluateChangeRiskGate(input.externalSignalState),
    ),
    productionDecisionPass: withTemporaryGateAcceptance(
      'productionDecisionPass',
      manifest,
      evaluateProductionDecisionGate(
        input.externalSignalState,
        input.capabilityState,
        input.flowProjection,
      ),
    ),
    browserPass: withTemporaryGateAcceptance(
      'browserPass',
      manifest,
      evaluateBrowserGate(env, evidenceSummary, certificationTarget),
    ),
    flowPass: withTemporaryGateAcceptance(
      'flowPass',
      manifest,
      evaluateFlowGate(
        evidenceSummary,
        manifest,
        certificationTargetRequiresGate(
          certificationTarget,
          certificationTiers,
          'flowPass',
          gateEvidence,
        ),
      ),
    ),
    invariantPass: withTemporaryGateAcceptance(
      'invariantPass',
      manifest,
      evaluateInvariantGate(evidenceSummary),
    ),
    securityPass: evaluatePatternGate(
      'securityPass',
      'No blocking security findings are open in this run.',
      'Security certification objective found blocking evidence.',
      input.health,
      manifest,
      CERTIFICATION_FINDING_PREDICATES.securityPass,
      filterCodacyIssues(input.scopeState.codacy, isCodacySecurityIssue),
    ),
    isolationPass: evaluatePatternGate(
      'isolationPass',
      'No blocking tenant isolation findings are open.',
      'Isolation certification objective found blocking evidence.',
      input.health,
      manifest,
      CERTIFICATION_FINDING_PREDICATES.isolationPass,
      filterCodacyIssues(input.scopeState.codacy, isCodacyIsolationIssue),
    ),
    recoveryPass: withTemporaryGateAcceptance(
      'recoveryPass',
      manifest,
      evaluateRecoveryGate(env, input.health, manifest, evidenceSummary),
    ),
    performancePass: withTemporaryGateAcceptance(
      'performancePass',
      manifest,
      env === 'scan'
        ? gateFail('Performance evidence was not exercised in scan mode.', _missingEvidenceLabel())
        : evaluatePatternGate(
            'performancePass',
            'Performance budgets have no blocking findings in this run.',
            'Performance certification objective found blocking evidence.',
            input.health,
            manifest,
            CERTIFICATION_FINDING_PREDICATES.performancePass,
          ),
    ),
    observabilityPass: withTemporaryGateAcceptance(
      'observabilityPass',
      manifest,
      evaluateObservabilityGate(input.health, manifest, evidenceSummary),
    ),
    customerPass: withTemporaryGateAcceptance(
      'customerPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'customerPass',
        'customer',
        evidenceSummary.customer,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    operatorPass: withTemporaryGateAcceptance(
      'operatorPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'operatorPass',
        'operator',
        evidenceSummary.operator,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    adminPass: withTemporaryGateAcceptance(
      'adminPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'adminPass',
        'admin',
        evidenceSummary.admin,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    soakPass: withTemporaryGateAcceptance(
      'soakPass',
      manifest,
      evaluateActorGateForCurrentObjective(
        'soakPass',
        'soak',
        evidenceSummary.soak,
        certificationTarget,
        certificationTiers,
        gateEvidence,
      ),
    ),
    syntheticCoveragePass: withTemporaryGateAcceptance(
      'syntheticCoveragePass',
      manifest,
      evaluateSyntheticCoverageGate(evidenceSummary),
    ),
    evidenceFresh: evaluateEvidenceFreshGate(
      evidenceSummary,
      input.scopeState.codacy,
      input.externalSignalState,
    ),
    pulseSelfTrustPass: withTemporaryGateAcceptance(
      'pulseSelfTrustPass',
      manifest,
      evaluatePulseSelfTrustGate(
        input.parserInventory,
        input.capabilityState,
        input.flowProjection,
        input.selfTrustReport,
        evidenceSummary.executionTrace,
      ),
    ),
    noOverclaimPass: withTemporaryGateAcceptance(
      'noOverclaimPass',
      manifest,
      evaluateNoOverclaimPassForCurrentRun(
        multiCycleConvergenceResult,
        input.autonomyState,
        productionProofReadinessGap,
        noHardcodedRealityGap,
        proofReadinessSummary,
        noHardcodedRealitySummary,
        input.previousDirective,
        input.previousCertificate,
      ),
    ),
    executionMatrixCompletePass: withTemporaryGateAcceptance(
      'executionMatrixCompletePass',
      manifest,
      evaluateExecutionMatrixCompleteGate(input.executionMatrix),
    ),
    criticalPathObservedPass: withTemporaryGateAcceptance(
      'criticalPathObservedPass',
      manifest,
      evaluateCriticalPathObservedGate(input.executionMatrix, pathCoverage),
    ),
    breakpointPrecisionPass: withTemporaryGateAcceptance(
      'breakpointPrecisionPass',
      manifest,
      evaluateBreakpointPrecisionGate(input.executionMatrix),
    ),
    multiCycleConvergencePass: multiCycleConvergenceResult,
    testHonestyPass: withTemporaryGateAcceptance(
      'testHonestyPass',
      manifest,
      (() => {
        const result = detectPlaceholderTests(input.rootDir);
        if (result.count === deriveZeroValue()) {
          return {
            status: _gatePassLabel(),
            reason: 'No placeholder tests detected in the repository.',
          };
        }
        return gateFail(
          `Found ${result.count} file(s) with placeholder tests: ${result.files.slice(0, 10).join(', ')}${result.files.length > 10 ? `... (and ${result.files.length - 10} more)` : ''}.`,
          _productFailureLabel(),
        );
      })(),
    ),
    assertionStrengthPass: withTemporaryGateAcceptance(
      'assertionStrengthPass',
      manifest,
      (() => {
        const result = detectWeakStatusAssertions(input.rootDir);
        if (result.count === deriveZeroValue()) {
          return {
            status: _gatePassLabel(),
            reason: 'No weak status assertions detected in e2e specs.',
          };
        }
        return gateFail(
          `Found ${result.count} file(s) with weak assertions: ${result.files.slice(0, 10).join(', ')}${result.files.length > 10 ? `... (and ${result.files.length - 10} more)` : ''}.`,
          _productFailureLabel(),
        );
      })(),
    ),
    typeIntegrityPass: withTemporaryGateAcceptance(
      'typeIntegrityPass',
      manifest,
      (() => {
        const result = detectTypeEscapeHatches(input.rootDir);
        if (result.count === deriveZeroValue()) {
          return {
            status: _gatePassLabel(),
            reason: 'Type-integrity evidence has no escape-hatch findings.',
          };
        }
        return gateFail(
          `Found ${result.count} type-integrity escape-hatch finding(s): ${result.locations.slice(0, 10).join(', ')}${result.locations.length > 10 ? `... (and ${result.locations.length - 10} more)` : ''}.`,
          _productFailureLabel(),
        );
      })(),
    ),
  };

  const gateOrder = deriveGateOrderFromResults(gates);
  const foundationalGates = deriveFoundationalGates(certificationTiers, gateOrder);
  const allPass = gateOrder.every((gateName) => gates[gateName].status === _gatePassLabel());
  const foundationsPass = foundationalGates.every(
    (gateName) => gates[gateName].status === _gatePassLabel(),
  );
  const tierStatus = buildTierStatuses(certificationTiers, gates, manifest, evidenceSummary);
  const blockingTier = getBlockingTier(tierStatus);
  const acceptedFlowsRemaining = getAcceptedCriticalFlows(manifest, evidenceSummary);
  const pendingCriticalScenarios = getPendingCriticalScenarios(evidenceSummary);
  const finalReadinessBlockingGates = gateOrder.filter((gateName) =>
    isGateBlockingFinalReadiness(gateName, gates[gateName]),
  );
  const finalReadinessPass =
    (!finalReadinessCriteria.requireAllTiersPass ||
      tierStatus.every((t) => t.status === _gatePassLabel())) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalFlows ||
      acceptedFlowsRemaining.length === deriveZeroValue()) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalScenarios ||
      pendingCriticalScenarios.length === deriveZeroValue()) &&
    (!finalReadinessCriteria.requireWorldStateConvergence ||
      !worldStateHasPendingCriticalExpectations(evidenceSummary)) &&
    finalReadinessBlockingGates.length === deriveZeroValue();

  const rawScore = input.health.score;
  const score = computeScore(rawScore, gates);
  const criticalFailures = gateOrder
    .filter((g) => gates[g].status === _gateFailLabel())
    .map((g) => `${g}: ${gates[g].reason}`);

  const status = deriveCertificationStatus(
    certificationTarget,
    foundationsPass,
    finalReadinessPass,
    tierStatus,
    allPass,
  );

  const dynamicBlockingReasons = unique(
    [
      input.scopeState.parity.status === 'fail' ? input.scopeState.parity.reason : null,
      input.scopeState.codacy.severityCounts.HIGH > deriveZeroValue()
        ? `Codacy still reports ${input.scopeState.codacy.severityCounts.HIGH} HIGH issue(s).`
        : null,
      input.capabilityState?.capabilities.some((c) => c.status === _phantomLabel())
        ? `Phantom capabilities remain: ${input.capabilityState.capabilities
            .filter((c) => c.status === _phantomLabel())
            .slice(0, 5)
            .map((c) => c.name)
            .join(', ')}.`
        : null,
      input.flowProjection?.flows.some((f) => f.status === _phantomLabel())
        ? `Phantom flows remain: ${input.flowProjection.flows
            .filter((f) => f.status === _phantomLabel())
            .slice(0, 5)
            .map((f) => f.id)
            .join(', ')}.`
        : null,
      input.scopeState.codacy.stale
        ? `Codacy snapshot is stale${input.scopeState.codacy.ageMinutes !== null ? ` (${input.scopeState.codacy.ageMinutes} minute(s) old)` : ''}.`
        : null,
      input.externalSignalState &&
      input.externalSignalState.summary.highImpactSignals > deriveZeroValue()
        ? `Observed external high-impact signals remain active: ${input.externalSignalState.summary.highImpactSignals}.`
        : null,
      input.externalSignalState &&
      input.externalSignalState.summary.staleAdapters > deriveZeroValue()
        ? `External evidence is stale for ${input.externalSignalState.summary.staleAdapters} adapter(s).`
        : null,
      input.externalSignalState &&
      input.externalSignalState.summary.missingAdapters > deriveZeroValue()
        ? `Required external adapters are missing: ${input.externalSignalState.summary.missingAdapters}.`
        : null,
      input.externalSignalState &&
      input.externalSignalState.summary.invalidAdapters > deriveZeroValue()
        ? `Required external adapters are invalid: ${input.externalSignalState.summary.invalidAdapters}.`
        : null,
      input.executionMatrix &&
      input.executionMatrix.summary.criticalUnobservedPaths > deriveZeroValue()
        ? `Execution matrix still has ${input.executionMatrix.summary.criticalUnobservedPaths} critical unobserved path(s).`
        : null,
      productionProofReadinessGap && proofReadinessSummary
        ? `Proof readiness still has non-observed production proof: ${formatProofReadinessGap(proofReadinessSummary)}.`
        : null,
      noHardcodedRealityGap
        ? `No-hardcoded-reality state still has hardcoded reality authority: ${formatNoHardcodedRealityBlocker(noHardcodedRealitySummary)}.`
        : null,
    ].filter(Boolean) as string[],
  );

  return {
    certificationScope:
      certificationTarget.certificationScope || certificationTarget.profile || null,
    version: '2.5.0',
    status,
    humanReplacementStatus:
      finalReadinessPass &&
      allPass &&
      gates.noOverclaimPass.status === _gatePassLabel() &&
      gates.multiCycleConvergencePass.status === _gatePassLabel()
        ? _readyLabel()
        : _notReadyLabel(),
    rawScore,
    score,
    commitSha: getCommitSha(input.rootDir),
    environment: env,
    timestamp,
    manifestPath: input.manifestResult.manifestPath,
    unknownSurfaces: input.manifestResult.unknownSurfaces.filter(
      (surface) =>
        !getActiveTemporaryAcceptances(manifest).some(
          (entry) => entry.targetType === 'surface' && entry.target === surface,
        ),
    ),
    unavailableChecks: input.parserInventory.unavailableChecks.map((item) => item.name),
    unsupportedStacks: input.manifestResult.unsupportedStacks,
    criticalFailures,
    gates,
    truthSummary: input.codebaseTruth.summary,
    truthDivergence: input.codebaseTruth.divergence,
    scopeStateSummary: input.scopeState.summary,
    codacySummary: input.scopeState.codacy,
    codacyEvidenceSummary: input.codacyEvidence?.summary ?? null,
    externalSignalSummary: input.externalSignalState?.summary ?? null,
    missingAdaptersCount: input.externalSignalState?.summary.missingAdapters ?? 0,
    staleAdaptersCount: input.externalSignalState?.summary.staleAdapters ?? 0,
    invalidAdaptersCount: input.externalSignalState?.summary.invalidAdapters ?? 0,
    blockingAdaptersCount: input.externalSignalState?.summary.blockingAdapters ?? 0,
    executionMatrixSummary: input.executionMatrix?.summary ?? null,
    resolvedManifestSummary: input.resolvedManifest.summary,
    structuralGraphSummary: input.structuralGraph?.summary ?? null,
    capabilityStateSummary: input.capabilityState?.summary ?? null,
    flowProjectionSummary: input.flowProjection?.summary ?? null,
    unresolvedModules: input.resolvedManifest.diagnostics.unresolvedModules,
    unresolvedFlows: input.resolvedManifest.diagnostics.unresolvedFlowGroups,
    certificationTarget,
    tierStatus,
    blockingTier,
    acceptedFlowsRemaining,
    pendingCriticalScenarios,
    finalReadinessCriteria,
    evidenceSummary,
    gateEvidence,
    dynamicBlockingReasons,
    noHardcodedRealityState,
  };
}
