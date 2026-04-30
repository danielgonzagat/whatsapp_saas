/**
 * Pulse artifact report and certificate builders.
 */
import { compact } from './artifacts.io';
import {
  buildDecisionQueue,
  buildAutonomyQueue,
  normalizeArtifactExecutionMode,
  normalizeArtifactStatus,
  normalizeArtifactText,
  normalizeCanonicalArtifactValue,
} from './artifacts.queue';
import { buildAutonomyCycleProof } from './artifacts.autonomy';
import { buildFindingEventSurface } from './finding-event-surface';
import type {
  PulseArtifactSnapshot,
  PulseMachineReadiness,
  PulseMachineReadinessCriterion,
} from './artifacts.types';
import type { PulseAutonomyState, PulseConvergencePlan, PulseExecutionMatrixPath } from './types';
import type { PulseArtifactCleanupReport } from './artifact-gc';
import { calculateCoverage } from './coverage-calculator';

export function getProductFacingCapabilities(
  snapshot: PulseArtifactSnapshot,
): PulseArtifactSnapshot['capabilityState']['capabilities'] {
  const productFacing = snapshot.capabilityState.capabilities.filter(
    (capability) => capability.userFacing || capability.routePatterns.length > 0,
  );
  return productFacing.length > 0 ? productFacing : snapshot.capabilityState.capabilities;
}

function statusFromBoolean(pass: boolean): PulseMachineReadinessCriterion['status'] {
  return pass ? 'pass' : 'fail';
}

function isCriticalMatrixPath(path: PulseExecutionMatrixPath): boolean {
  return path.risk === 'high' || path.risk === 'critical';
}

function hasPreciseTerminalReason(path: PulseExecutionMatrixPath): boolean {
  if (path.status === 'observed_pass' || path.status === 'observed_fail') {
    return true;
  }
  if (path.status === 'blocked_human_required') {
    return false;
  }
  const breakpoint = path.breakpoint;
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > 0 && breakpoint.recovery.length > 0;
}

function getTerminalCriticalPathDiagnostics(paths: PulseExecutionMatrixPath[]): {
  terminalWithoutObservedEvidence: number;
  firstTerminalPathId: string | null;
  nextAiSafeAction: string;
} {
  const terminalOnlyPaths = paths.filter(
    (path) =>
      isCriticalMatrixPath(path) &&
      path.status !== 'observed_pass' &&
      path.status !== 'observed_fail' &&
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
  const boundedExecutableUnits = autonomyQueue.slice(0, 8);
  const boundedRunPass = boundedExecutableUnits.length > 0 && boundedExecutableUnits.length <= 8;
  const consistencyCheck = snapshot.certification.selfTrustReport?.checks?.find(
    (check) => check.id === 'cross-artifact-consistency',
  );
  const artifactConsistencyPass = consistencyCheck?.pass === true;
  const executionMatrixGate = snapshot.certification.gates.executionMatrixCompletePass;
  const criticalPathGate = snapshot.certification.gates.criticalPathObservedPass;
  const breakpointGate = snapshot.certification.gates.breakpointPrecisionPass;
  const externalSummary = snapshot.externalSignalState.summary;
  const externalRealityPass =
    externalSummary.missingAdapters === 0 &&
    externalSummary.staleAdapters === 0 &&
    externalSummary.invalidAdapters === 0;
  const selfTrustGate = snapshot.certification.gates.pulseSelfTrustPass;
  const selfTrustPass = selfTrustGate.status === 'pass';
  const multiCycleGate = snapshot.certification.gates.multiCycleConvergencePass;
  const cycleProof = buildAutonomyCycleProof(previousAutonomyState);
  const multiCyclePass = multiCycleGate.status === 'pass' && cycleProof.proven;
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
        nextExecutableUnitLimit: 8,
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
        terminalArtifact: 'PULSE_EXECUTION_MATRIX.json',
        coverageArtifact: 'PULSE_PATH_COVERAGE.json',
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
    .filter((criterion) => criterion.status !== 'pass')
    .map((criterion) => `${criterion.id}: ${criterion.reason}`);
  const ready = blockers.length === 0;

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
