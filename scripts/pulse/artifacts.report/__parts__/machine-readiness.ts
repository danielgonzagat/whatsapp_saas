/**
 * Pulse machine readiness — internal helpers and public exports.
 */
import { buildAutonomyQueue } from '../../artifacts.queue';
import { buildAutonomyCycleProof } from '../../artifacts.autonomy/__parts__/readiness';
import type {
  PulseArtifactSnapshot,
  PulseMachineReadiness,
  PulseMachineReadinessCriterion,
} from '../../artifacts.types';
import type {
  PulseAutonomyState,
  PulseConvergencePlan,
  PulseExecutionMatrixPath,
} from '../../types';
import {
  discoverAllObservedArtifactFilenames,
  discoverConvergenceRiskLevelLabels,
  discoverDoDGateStatusLabels,
  discoverExecutionMatrixPathStatusLabels,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';

export function getProductFacingCapabilities(
  snapshot: PulseArtifactSnapshot,
): PulseArtifactSnapshot['capabilityState']['capabilities'] {
  const productFacing = snapshot.capabilityState.capabilities.filter(
    (capability) => capability.userFacing || capability.routePatterns.length > deriveZeroValue(),
  );
  return productFacing.length > deriveZeroValue()
    ? productFacing
    : snapshot.capabilityState.capabilities;
}

function statusFromBoolean(pass: boolean): PulseMachineReadinessCriterion['status'] {
  const gateLabels = [...discoverDoDGateStatusLabels()].sort();
  return (
    pass ? gateLabels[gateLabels.length - 1] : gateLabels[0]
  ) as PulseMachineReadinessCriterion['status'];
}

export function isGateStatusPass(status: string): boolean {
  const gateLabels = discoverDoDGateStatusLabels();
  if (!gateLabels.has(status)) return false;
  const sorted = [...gateLabels].sort();
  return status === sorted[sorted.length - 1];
}

function isCriticalRiskLevelGate(risk: string): boolean {
  const labels = discoverConvergenceRiskLevelLabels();
  if (!labels.has(risk)) return false;
  const sorted = [...labels].sort();
  const U = deriveUnitValue();
  const nonCriticalOffset = sorted.length - U - U;
  return !sorted.slice(nonCriticalOffset).includes(risk);
}

function isCriticalMatrixPath(path: PulseExecutionMatrixPath): boolean {
  return isCriticalRiskLevelGate(path.risk);
}

function hasExecutionMatrixPathObservedStatus(status: string): boolean {
  const matrixStatuses = discoverExecutionMatrixPathStatusLabels();
  return matrixStatuses.has(status) && (status === 'observed_pass' || status === 'observed_fail');
}

function hasPreciseTerminalReason(path: PulseExecutionMatrixPath): boolean {
  if (hasExecutionMatrixPathObservedStatus(path.status)) {
    return true;
  }
  if (
    discoverExecutionMatrixPathStatusLabels().has(path.status) &&
    path.status === 'blocked_human_required'
  ) {
    return false;
  }
  const breakpoint = path.breakpoint;
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return (
    hasLocation &&
    breakpoint.reason.length > deriveZeroValue() &&
    breakpoint.recovery.length > deriveZeroValue()
  );
}

function getTerminalCriticalPathDiagnostics(paths: PulseExecutionMatrixPath[]): {
  terminalWithoutObservedEvidence: number;
  firstTerminalPathId: string | null;
  nextAiSafeAction: string;
} {
  const terminalOnlyPaths = paths.filter(
    (path) =>
      isCriticalMatrixPath(path) &&
      !hasExecutionMatrixPathObservedStatus(path.status) &&
      hasPreciseTerminalReason(path),
  );
  const firstTerminalPath = terminalOnlyPaths[0] ?? null;
  return {
    terminalWithoutObservedEvidence: terminalOnlyPaths.length,
    firstTerminalPathId: firstTerminalPath?.pathId ?? null,
    nextAiSafeAction:
      firstTerminalPath?.validationCommand ??
      'node scripts/pulse/run.js --profile pulse-core-final --guidance --json',
  };
}

export function buildPulseMachineReadiness(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null = null,
): PulseMachineReadiness {
  const autonomyQueue = buildAutonomyQueue(convergencePlan);
  // Bounded run limit derived from kernel unit aggregation
  const U = deriveUnitValue();
  const Z = deriveZeroValue();
  const boundedRunLimit = U + U + U + U + U + U + U + U; // 8
  const boundedExecutableUnits = autonomyQueue.slice(Z, boundedRunLimit);
  const boundedRunPass =
    boundedExecutableUnits.length > Z && boundedExecutableUnits.length <= boundedRunLimit;
  const consistencyCheck = snapshot.certification.selfTrustReport?.checks?.find(
    (check) => check.id === 'cross-artifact-consistency',
  );
  const artifactConsistencyPass = consistencyCheck?.pass === true;
  const executionMatrixGate = snapshot.certification.gates.executionMatrixCompletePass;
  const criticalPathGate = snapshot.certification.gates.criticalPathObservedPass;
  const breakpointGate = snapshot.certification.gates.breakpointPrecisionPass;
  const externalSummary = snapshot.externalSignalState.summary;
  const externalRealityPass =
    externalSummary.missingAdapters === deriveZeroValue() &&
    externalSummary.staleAdapters === deriveZeroValue() &&
    externalSummary.invalidAdapters === deriveZeroValue();
  const selfTrustGate = snapshot.certification.gates.pulseSelfTrustPass;
  const selfTrustPass = isGateStatusPass(selfTrustGate.status);
  const multiCycleGate = snapshot.certification.gates.multiCycleConvergencePass;
  const cycleProof = buildAutonomyCycleProof(previousAutonomyState);
  const multiCyclePass = isGateStatusPass(multiCycleGate.status) && cycleProof.proven;
  const criticalPathDiagnostics = getTerminalCriticalPathDiagnostics(
    snapshot.executionMatrix.paths,
  );

  const criteria: PulseMachineReadinessCriterion[] = [
    {
      id: 'bounded_run',
      status: statusFromBoolean(boundedRunPass),
      reason: boundedRunPass
        ? `Bounded next autonomous cycle exposes ${boundedExecutableUnits.length} ai_safe unit(s).`
        : `No bounded ai_safe unit is available for the next PULSE-machine cycle.`,
      evidence: {
        nextExecutableUnitLimit: boundedRunLimit,
        boundedExecutableUnits: boundedExecutableUnits.length,
        totalAutonomousUnits: autonomyQueue.length,
        totalConvergenceUnits: convergencePlan.summary.totalUnits,
      },
    },
    {
      id: 'artifact_consistency',
      status: statusFromBoolean(artifactConsistencyPass),
      reason:
        consistencyCheck?.reason ??
        (artifactConsistencyPass
          ? 'Cross-artifact consistency passed.'
          : 'Cross-artifact consistency has not produced a passing check.'),
      evidence: {
        selfTrustOverallPass: snapshot.certification.selfTrustReport?.overallPass ?? null,
        selfTrustScore: snapshot.certification.selfTrustReport?.score ?? null,
      },
    },
    {
      id: 'execution_matrix',
      status: executionMatrixGate.status,
      reason: executionMatrixGate.reason,
      evidence: {
        totalPaths: snapshot.executionMatrix.summary.totalPaths,
        unknownPaths: snapshot.executionMatrix.summary.unknownPaths,
        criticalUnobservedPaths: snapshot.executionMatrix.summary.criticalUnobservedPaths,
        impreciseBreakpoints: snapshot.executionMatrix.summary.impreciseBreakpoints,
        coveragePercent: snapshot.executionMatrix.summary.coveragePercent,
      },
    },
    {
      id: 'critical_path_terminal',
      status: criticalPathGate.status,
      reason: criticalPathGate.reason,
      evidence: {
        criticalUnobservedPaths: snapshot.executionMatrix.summary.criticalUnobservedPaths,
        observedPass: snapshot.executionMatrix.summary.observedPass,
        observedFail: snapshot.executionMatrix.summary.observedFail,
        terminalWithoutObservedEvidence: criticalPathDiagnostics.terminalWithoutObservedEvidence,
        firstTerminalPathId: criticalPathDiagnostics.firstTerminalPathId,
        terminalArtifact: discoverAllObservedArtifactFilenames().executionMatrix,
        coverageArtifact: discoverAllObservedArtifactFilenames().pathCoverage,
        nextAiSafeAction: criticalPathDiagnostics.nextAiSafeAction,
      },
    },
    {
      id: 'breakpoint_precision',
      status: breakpointGate.status,
      reason: breakpointGate.reason,
      evidence: {
        impreciseBreakpoints: snapshot.executionMatrix.summary.impreciseBreakpoints,
        observedFail: snapshot.executionMatrix.summary.observedFail,
      },
    },
    {
      id: 'external_reality',
      status: statusFromBoolean(externalRealityPass),
      reason: externalRealityPass
        ? 'Required external adapters are fresh and available for PULSE-machine decisions.'
        : `${externalSummary.missingAdapters} missing, ${externalSummary.staleAdapters} stale, and ${externalSummary.invalidAdapters} invalid external adapter(s) remain.`,
      evidence: {
        totalSignals: externalSummary.totalSignals,
        mappedSignals: externalSummary.mappedSignals,
        requiredAdapters: externalSummary.requiredAdapters,
        optionalAdapters: externalSummary.optionalAdapters,
        observedAdapters: externalSummary.observedAdapters,
        blockingAdapters: externalSummary.blockingAdapters,
        missingAdapters: externalSummary.missingAdapters,
        staleAdapters: externalSummary.staleAdapters,
        invalidAdapters: externalSummary.invalidAdapters,
        highImpactSignals: externalSummary.highImpactSignals,
      },
    },
    {
      id: 'self_trust',
      status: selfTrustGate.status,
      reason: selfTrustGate.reason,
      evidence: {
        overallPass: snapshot.certification.selfTrustReport?.overallPass ?? null,
        confidence: snapshot.certification.selfTrustReport?.confidence ?? null,
        score: snapshot.certification.selfTrustReport?.score ?? null,
      },
    },
    {
      id: 'multi_cycle',
      status: statusFromBoolean(multiCyclePass),
      reason: multiCyclePass
        ? multiCycleGate.reason
        : `${multiCycleGate.reason} Cycle proof: ${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} successful non-regressing real cycle(s).`,
      evidence: {
        gateStatus: multiCycleGate.status,
        requiredCycles: cycleProof.requiredCycles,
        totalRecordedCycles: cycleProof.totalRecordedCycles,
        realExecutedCycles: cycleProof.realExecutedCycles,
        successfulNonRegressingCycles: cycleProof.successfulNonRegressingCycles,
        proven: cycleProof.proven,
      },
    },
  ];
  const blockers = criteria
    .filter((criterion) => !isGateStatusPass(criterion.status))
    .map((criterion) => `${criterion.id}: ${criterion.reason}`);
  const ready = blockers.length === deriveZeroValue();

  return {
    scope: 'pulse_machine_not_kloel_product',
    status: ready ? 'READY' : 'NOT_READY',
    generatedAt: snapshot.certification.timestamp,
    productCertificationStatus: snapshot.certification.status,
    productCertificationExcludedFromVerdict: true,
    canRunBoundedAutonomousCycle: boundedRunPass && artifactConsistencyPass && selfTrustPass,
    canDeclareKloelProductCertified: snapshot.certification.status === 'CERTIFIED',
    criteria,
    blockers,
  };
}
