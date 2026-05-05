import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type { PulseArtifactSnapshot } from '../../__parts__/artifacts/types';
import type { PulseAutonomyState } from '../../types.autonomy';
import type { PulseConvergencePlan } from '../../types.convergence';
import type { QueueUnit } from '../../artifacts.queue';
import { GATE_PASS, GATE_FAIL } from './types';
import type {
  AuthorityState,
  PulseMachineReadinessGateName,
  PulseMachineReadinessGate,
  PulseMachineReadiness,
} from './types';
import { buildAutonomyCycleProof } from './readiness';

function pass(reason: string): PulseMachineReadinessGate {
  return { status: GATE_PASS, reason };
}

function fail(reason: string): PulseMachineReadinessGate {
  return { status: GATE_FAIL, reason };
}

function getCrossArtifactConsistencyGate(
  snapshot: PulseArtifactSnapshot,
): PulseMachineReadinessGate {
  const consistency = snapshot.certification.selfTrustReport?.checks?.find(
    (check) => check.id === 'cross-artifact-consistency',
  );
  if (!consistency) {
    return fail('Cross-artifact consistency was not evaluated in this run.');
  }
  if (!consistency.pass) {
    return fail(consistency.reason || 'Canonical PULSE artifacts disagree on shared fields.');
  }
  return pass(
    consistency.reason || 'Canonical PULSE artifacts agree on shared machine-readiness fields.',
  );
}

export function buildPulseMachineReadiness(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  authority: AuthorityState,
  autonomyQueue: QueueUnit[],
  previousAutonomyState: PulseAutonomyState | null,
): PulseMachineReadiness {
  const cycleProof = buildAutonomyCycleProof(previousAutonomyState);
  const invalidAdapters = snapshot.externalSignalState.summary.invalidAdapters;
  const externalBlocked =
    snapshot.externalSignalState.summary.missingAdapters +
    snapshot.externalSignalState.summary.staleAdapters +
    invalidAdapters;
  const matrix = snapshot.executionMatrix;
  const boundedRunGate =
    matrix && matrix.generatedAt
      ? pass(
          `This run produced an execution matrix with ${matrix.summary.totalPaths} classified path(s).`,
        )
      : fail('This run did not produce a bounded execution-matrix artifact.');
  const gateKernelGrammarResults: Record<PulseMachineReadinessGateName, PulseMachineReadinessGate> =
    {
      boundedRunPass: boundedRunGate,
      artifactConsistencyPass: getCrossArtifactConsistencyGate(snapshot),
      executionMatrixPass:
        snapshot.certification.gates.executionMatrixCompletePass.status === GATE_PASS
          ? pass(snapshot.certification.gates.executionMatrixCompletePass.reason)
          : fail(snapshot.certification.gates.executionMatrixCompletePass.reason),
      criticalPathTerminalPass:
        snapshot.certification.gates.criticalPathObservedPass.status === GATE_PASS
          ? pass(snapshot.certification.gates.criticalPathObservedPass.reason)
          : fail(snapshot.certification.gates.criticalPathObservedPass.reason),
      breakpointPrecisionPass:
        snapshot.certification.gates.breakpointPrecisionPass.status === GATE_PASS
          ? pass(snapshot.certification.gates.breakpointPrecisionPass.reason)
          : fail(snapshot.certification.gates.breakpointPrecisionPass.reason),
      externalSignalsPass:
        externalBlocked === deriveZeroValue()
          ? pass('All required external adapters are fresh, available, and valid.')
          : fail(
              `${snapshot.externalSignalState.summary.missingAdapters} missing, ${snapshot.externalSignalState.summary.staleAdapters} stale, and ${invalidAdapters} invalid external adapter(s) remain.`,
            ),
      directiveActionabilityPass:
        autonomyQueue.length > deriveZeroValue() ||
        (snapshot.certification.status === 'CERTIFIED' &&
          snapshot.certification.humanReplacementStatus === 'READY')
          ? pass(
              autonomyQueue.length > deriveZeroValue()
                ? `${autonomyQueue.length} ai_safe unit(s) are available for a fresh AI session.`
                : 'The machine is certified and no autonomous work remains.',
            )
          : fail('No ai_safe unit is available and the machine is not certified complete.'),
      selfTrustPass:
        snapshot.certification.gates.pulseSelfTrustPass.status === GATE_PASS
          ? pass(snapshot.certification.gates.pulseSelfTrustPass.reason)
          : fail(snapshot.certification.gates.pulseSelfTrustPass.reason),
      multiCycleConvergencePass:
        snapshot.certification.gates.multiCycleConvergencePass.status === GATE_PASS &&
        cycleProof.proven
          ? pass(snapshot.certification.gates.multiCycleConvergencePass.reason)
          : fail(
              `${snapshot.certification.gates.multiCycleConvergencePass.reason} Cycle proof: ${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles}.`,
            ),
    };
  const blockers = Object.entries(gateKernelGrammarResults)
    .filter(([, gate]) => gate.status === GATE_FAIL)
    .map(([name, gate]) => `${name}: ${gate.reason}`);
  const passingGates = Object.values(gateKernelGrammarResults).filter(
    (gate) => gate.status === GATE_PASS,
  ).length;
  const ready = blockers.length === deriveZeroValue();

  return {
    generatedAt: snapshot.certification.timestamp,
    status: ready ? 'READY' : 'NOT_READY',
    canDeclarePulseComplete: ready,
    authorityMode: authority.mode,
    gates: gateKernelGrammarResults,
    blockers,
    summary: {
      totalGates: Object.keys(gateKernelGrammarResults).length,
      passingGates,
      failingGates: Object.keys(gateKernelGrammarResults).length - passingGates,
      executionMatrixPaths: matrix?.summary.totalPaths ?? deriveZeroValue(),
      criticalUnobservedPaths: matrix?.summary.criticalUnobservedPaths ?? deriveZeroValue(),
      impreciseBreakpoints: matrix?.summary.impreciseBreakpoints ?? deriveZeroValue(),
      automationSafeUnits: autonomyQueue.length,
      successfulNonRegressingCycles: cycleProof.successfulNonRegressingCycles,
      requiredCycles: cycleProof.requiredCycles,
    },
  };
}
