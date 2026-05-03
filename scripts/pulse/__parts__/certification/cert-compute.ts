import type { PulseCertification, PulseGateName } from '../../types';

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
} from '../../cert-helpers';

import { computeScore, buildTierStatuses, getBlockingTier } from '../../cert-gate-evaluators-actor';
import { buildDefaultEvidence } from '../../cert-evidence-defaults';
import { mergeExecutionEvidence } from '../../cert-evidence-merge';
import { buildGateEvidence } from '../../cert-gate-evidence';
import { formatProofReadinessGap, hasProductionProofReadinessGap } from '../../cert-gate-overclaim';
import { evaluateMultiCycleConvergenceGate } from '../../cert-gate-multi-cycle';
import { withTemporaryGateAcceptance } from '../../cert-gate-pattern';
import {
  buildPulseNoHardcodedRealityState,
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
} from '../../no-hardcoded-reality-state';
import { PROOF_READINESS_ARTIFACT } from '../../proof-readiness-artifact';

import {
  NO_HARDCODED_REALITY_ARTIFACT,
  loadPathCoverageGateState,
  loadProofReadinessSummary,
  type ComputeCertificationInput,
  type GateBuildContext,
} from './cert-helpers';

import {
  deriveCertificationStatus,
  deriveFoundationalGates,
  isGateBlockingFinalReadiness,
} from './cert-status';

import { buildCertificationGates } from './cert-gates';

export function computeCertification(input: ComputeCertificationInput): PulseCertification {
  const env = getEnvironment();
  const manifest = input.manifestResult.manifest;
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
        artifactPaths: ['PULSE_EXECUTION_MATRIX.json'],
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
          pathCoverage?.summary?.criticalUnobserved && pathCoverage.summary.criticalUnobserved > 0
            ? `${pathCoverage.summary.criticalUnobserved} critical path(s) remain unobserved in path coverage.`
            : `${input.executionMatrix.summary.criticalUnobservedPaths} critical path(s) lack observed pass/fail evidence.`,
        artifactPaths: pathCoverage
          ? ['PULSE_EXECUTION_MATRIX.json', 'PULSE_PATH_COVERAGE.json']
          : ['PULSE_EXECUTION_MATRIX.json'],
        metrics: {
          criticalUnobservedPaths: input.executionMatrix.summary.criticalUnobservedPaths,
          criticalInferredOnlyPaths: pathCoverage?.summary?.criticalInferredOnly ?? 0,
          criticalPathCoverageUnobserved: pathCoverage?.summary?.criticalUnobserved ?? 0,
          pathCoveragePercent: pathCoverage?.summary?.coveragePercent ?? null,
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
        artifactPaths: ['PULSE_EXECUTION_MATRIX.json'],
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

  const gates = buildCertificationGates(input, {
    env,
    manifest,
    certificationTarget,
    certificationTiers,
    pathCoverage,
    proofReadinessSummary,
    productionProofReadinessGap,
    noHardcodedRealityGap,
    noHardcodedRealitySummary,
    multiCycleConvergenceResult,
    evidenceSummary,
    gateEvidence,
  });

  const gateOrder = (Object.keys(gates) as PulseGateName[]).filter((gateName) => gates[gateName]);
  const foundationalGates = deriveFoundationalGates(certificationTiers, gateOrder);
  const allPass = gateOrder.every((gateName) => gates[gateName].status === 'pass');
  const foundationsPass = foundationalGates.every((gateName) => gates[gateName].status === 'pass');
  const tierStatus = buildTierStatuses(certificationTiers, gates, manifest, evidenceSummary);
  const blockingTier = getBlockingTier(tierStatus);
  const acceptedFlowsRemaining = getAcceptedCriticalFlows(manifest, evidenceSummary);
  const pendingCriticalScenarios = getPendingCriticalScenarios(evidenceSummary);
  const finalReadinessBlockingGates = gateOrder.filter((gateName) =>
    isGateBlockingFinalReadiness(gateName, gates[gateName]),
  );
  const finalReadinessPass =
    (!finalReadinessCriteria.requireAllTiersPass || tierStatus.every((t) => t.status === 'pass')) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalFlows ||
      acceptedFlowsRemaining.length === 0) &&
    (!finalReadinessCriteria.requireNoAcceptedCriticalScenarios ||
      pendingCriticalScenarios.length === 0) &&
    (!finalReadinessCriteria.requireWorldStateConvergence ||
      !worldStateHasPendingCriticalExpectations(evidenceSummary)) &&
    finalReadinessBlockingGates.length === 0;

  const rawScore = input.health.score;
  const score = computeScore(rawScore, gates);
  const criticalFailures = gateOrder
    .filter((g) => gates[g].status === 'fail')
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
      input.scopeState.codacy.severityCounts.HIGH > 0
        ? `Codacy still reports ${input.scopeState.codacy.severityCounts.HIGH} HIGH issue(s).`
        : null,
      input.capabilityState?.capabilities.some((c) => c.status === 'phantom')
        ? `Phantom capabilities remain: ${input.capabilityState.capabilities
            .filter((c) => c.status === 'phantom')
            .slice(0, 5)
            .map((c) => c.name)
            .join(', ')}.`
        : null,
      input.flowProjection?.flows.some((f) => f.status === 'phantom')
        ? `Phantom flows remain: ${input.flowProjection.flows
            .filter((f) => f.status === 'phantom')
            .slice(0, 5)
            .map((f) => f.id)
            .join(', ')}.`
        : null,
      input.scopeState.codacy.stale
        ? `Codacy snapshot is stale${input.scopeState.codacy.ageMinutes !== null ? ` (${input.scopeState.codacy.ageMinutes} minute(s) old)` : ''}.`
        : null,
      input.externalSignalState && input.externalSignalState.summary.highImpactSignals > 0
        ? `Observed external high-impact signals remain active: ${input.externalSignalState.summary.highImpactSignals}.`
        : null,
      input.externalSignalState && input.externalSignalState.summary.staleAdapters > 0
        ? `External evidence is stale for ${input.externalSignalState.summary.staleAdapters} adapter(s).`
        : null,
      input.externalSignalState && input.externalSignalState.summary.missingAdapters > 0
        ? `Required external adapters are missing: ${input.externalSignalState.summary.missingAdapters}.`
        : null,
      input.externalSignalState && input.externalSignalState.summary.invalidAdapters > 0
        ? `Required external adapters are invalid: ${input.externalSignalState.summary.invalidAdapters}.`
        : null,
      input.executionMatrix && input.executionMatrix.summary.criticalUnobservedPaths > 0
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
      gates.noOverclaimPass.status === 'pass' &&
      gates.multiCycleConvergencePass.status === 'pass'
        ? 'READY'
        : 'NOT_READY',
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
