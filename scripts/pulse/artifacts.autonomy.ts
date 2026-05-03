import { unique } from './artifacts.io';
import { isRuntimeExternalSignal } from './cert-helpers';
import type { PulseArtifactSnapshot } from './artifacts';
import type { PulseAutonomyState, PulseConvergencePlan } from './types';
import type { QueueUnit } from './artifacts.queue';
import type { AuthorityMode } from './types.authority-mode';
import type {
  AuthorityState,
  AutonomyReadiness,
  PulseMachineReadiness,
  PulseMachineReadinessGateName,
  PulseMachineReadinessGate,
} from './__parts__/autonomy.types';
import {
  hasValidatableAiSafeUnit,
  buildAutonomyCycleProof,
  fail,
  getCrossArtifactConsistencyGate,
  pass,
} from './__parts__/autonomy.helpers';
export { buildAutonomyProof } from './__parts__/autonomy.proof';
export { buildAutonomyCycleProof } from './__parts__/autonomy.helpers';

export type { AuthorityState, AutonomyReadiness, CycleProof } from './__parts__/autonomy.types';
export type {
  PulseMachineReadinessGateName,
  PulseMachineReadinessGate,
  PulseMachineReadiness,
} from './__parts__/autonomy.types';

export function deriveAuthorityState(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): AuthorityState {
  const coreBlockingReasons: string[] = [];
  const productionLimitReasons: string[] = [];
  const evidenceFreshPass = snapshot.certification.gates.evidenceFresh.status === 'pass';
  const pulseSelfTrustPass = snapshot.certification.gates.pulseSelfTrustPass.status === 'pass';
  const productionDecisionPass =
    snapshot.certification.gates.productionDecisionPass.status === 'pass';
  const runtimePass = snapshot.certification.gates.runtimePass.status === 'pass';
  const validatableAiSafeUnit = hasValidatableAiSafeUnit(convergencePlan);
  const staleExternalAdapters = snapshot.externalSignalState.summary.staleAdapters > 0;
  const missingExternalAdapters = snapshot.externalSignalState.summary.missingAdapters > 0;
  const highImpactExternalSignals = snapshot.externalSignalState.signals.some(
    (signal) => isRuntimeExternalSignal(signal) && signal.impactScore >= 0.75,
  );
  if (!evidenceFreshPass) {
    coreBlockingReasons.push('Evidence freshness is not closed.');
  }
  if (!pulseSelfTrustPass) {
    coreBlockingReasons.push('Pulse self-trust is still failing.');
  }
  if (!productionDecisionPass) {
    productionLimitReasons.push('Production decision gate is not passing.');
  }
  if (!runtimePass) {
    coreBlockingReasons.push('Runtime pass is not green with live evidence.');
  }
  if (staleExternalAdapters) {
    productionLimitReasons.push(
      `${snapshot.externalSignalState.summary.staleAdapters} external adapter(s) are stale.`,
    );
  }
  if (missingExternalAdapters) {
    productionLimitReasons.push(
      `${snapshot.externalSignalState.summary.missingAdapters} external adapter(s) are not configured.`,
    );
  }
  if (highImpactExternalSignals) {
    productionLimitReasons.push(
      `${snapshot.externalSignalState.summary.highImpactSignals} high-impact external signal(s) remain active.`,
    );
  }
  if (coreBlockingReasons.length > 0) {
    return {
      mode: 'advisory-only',
      advisoryOnly: true,
      automationEligible: false,
      reasons: unique(coreBlockingReasons),
    };
  }

  if (
    snapshot.certification.status === 'CERTIFIED' &&
    snapshot.certification.humanReplacementStatus === 'READY'
  ) {
    return {
      mode: 'certified-autonomous',
      advisoryOnly: false,
      automationEligible: true,
      reasons: [
        'Certification is fully green — all gates passed including no-overclaim and multi-cycle convergence.',
      ],
    };
  }

  if ((snapshot.certification.blockingTier ?? 99) <= 1 || validatableAiSafeUnit) {
    return {
      mode: 'autonomous-execution',
      advisoryOnly: false,
      automationEligible: true,
      reasons: unique(
        [
          'Core trust, evidence freshness, and runtime gates are green; bounded autonomous execution may proceed.',
          validatableAiSafeUnit
            ? 'A validatable ai_safe unit is available for bounded autonomous execution.'
            : '',
          ...productionLimitReasons.map(
            (reason) => `Production completion remains blocked: ${reason}`,
          ),
        ].filter(Boolean),
      ),
    };
  }

  return {
    mode: 'operator-gated',
    advisoryOnly: false,
    automationEligible: false,
    reasons: unique([
      'Core trust gates are green, but blocking tiers still require operator promotion.',
      ...productionLimitReasons.map((reason) => `Production completion remains blocked: ${reason}`),
    ]),
  };
}

export function buildAutonomyReadiness(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  autonomyQueue: QueueUnit[],
): AutonomyReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (
    snapshot.certification.status === 'CERTIFIED' &&
    snapshot.certification.humanReplacementStatus === 'READY'
  ) {
    return {
      verdict: 'SIM',
      mode: 'complete',
      verdictScope: 'production_autonomy',
      canWorkNow: false,
      canContinueUntilReady: true,
      canDeclareComplete: true,
      automationSafeUnits: 0,
      blockers,
      warnings: ['Current checkpoint is fully certified and ready for autonomous operation.'],
    };
  }

  if (autonomyQueue.length === 0) {
    blockers.push('No balanced ai_safe convergence unit is currently exposed for autonomous work.');
  }

  if (snapshot.externalSignalState.summary.missingAdapters > 0) {
    warnings.push(
      `${snapshot.externalSignalState.summary.missingAdapters} external adapter(s) are missing; production reality is incomplete but local convergence can still proceed.`,
    );
  }

  if (convergencePlan.summary.humanRequiredUnits > 0) {
    warnings.push(
      `${convergencePlan.summary.humanRequiredUnits} legacy protected-surface unit(s) were normalized into governed validation or observation-only evidence gathering.`,
    );
  }

  if (snapshot.certification.gates.pulseSelfTrustPass.status !== 'pass') {
    warnings.push(snapshot.certification.gates.pulseSelfTrustPass.reason);
  }

  return {
    verdict: blockers.length === 0 ? 'SIM' : 'NAO',
    mode: blockers.length === 0 ? 'autonomous_next_step' : 'blocked',
    verdictScope: 'next_autonomous_step',
    canWorkNow: blockers.length === 0,
    canContinueUntilReady: false,
    canDeclareComplete: false,
    automationSafeUnits: autonomyQueue.length,
    blockers,
    warnings,
  };
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
        snapshot.certification.gates.executionMatrixCompletePass.status === 'pass'
          ? pass(snapshot.certification.gates.executionMatrixCompletePass.reason)
          : fail(snapshot.certification.gates.executionMatrixCompletePass.reason),
      criticalPathTerminalPass:
        snapshot.certification.gates.criticalPathObservedPass.status === 'pass'
          ? pass(snapshot.certification.gates.criticalPathObservedPass.reason)
          : fail(snapshot.certification.gates.criticalPathObservedPass.reason),
      breakpointPrecisionPass:
        snapshot.certification.gates.breakpointPrecisionPass.status === 'pass'
          ? pass(snapshot.certification.gates.breakpointPrecisionPass.reason)
          : fail(snapshot.certification.gates.breakpointPrecisionPass.reason),
      externalSignalsPass:
        externalBlocked === 0
          ? pass('All required external adapters are fresh, available, and valid.')
          : fail(
              `${snapshot.externalSignalState.summary.missingAdapters} missing, ${snapshot.externalSignalState.summary.staleAdapters} stale, and ${invalidAdapters} invalid external adapter(s) remain.`,
            ),
      directiveActionabilityPass:
        autonomyQueue.length > 0 ||
        (snapshot.certification.status === 'CERTIFIED' &&
          snapshot.certification.humanReplacementStatus === 'READY')
          ? pass(
              autonomyQueue.length > 0
                ? `${autonomyQueue.length} ai_safe unit(s) are available for a fresh AI session.`
                : 'The machine is certified and no autonomous work remains.',
            )
          : fail('No ai_safe unit is available and the machine is not certified complete.'),
      selfTrustPass:
        snapshot.certification.gates.pulseSelfTrustPass.status === 'pass'
          ? pass(snapshot.certification.gates.pulseSelfTrustPass.reason)
          : fail(snapshot.certification.gates.pulseSelfTrustPass.reason),
      multiCycleConvergencePass:
        snapshot.certification.gates.multiCycleConvergencePass.status === 'pass' &&
        cycleProof.proven
          ? pass(snapshot.certification.gates.multiCycleConvergencePass.reason)
          : fail(
              `${snapshot.certification.gates.multiCycleConvergencePass.reason} Cycle proof: ${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles}.`,
            ),
    };
  const blockers = Object.entries(gateKernelGrammarResults)
    .filter(([, gate]) => gate.status === 'fail')
    .map(([name, gate]) => `${name}: ${gate.reason}`);
  const passingGates = Object.values(gateKernelGrammarResults).filter(
    (gate) => gate.status === 'pass',
  ).length;
  const ready = blockers.length === 0;

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
      executionMatrixPaths: matrix?.summary.totalPaths ?? 0,
      criticalUnobservedPaths: matrix?.summary.criticalUnobservedPaths ?? 0,
      impreciseBreakpoints: matrix?.summary.impreciseBreakpoints ?? 0,
      automationSafeUnits: autonomyQueue.length,
      successfulNonRegressingCycles: cycleProof.successfulNonRegressingCycles,
      requiredCycles: cycleProof.requiredCycles,
    },
  };
}
