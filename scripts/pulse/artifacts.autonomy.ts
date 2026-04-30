/**
 * Pulse artifact autonomy authority and proof builders.
 */
import { unique } from './artifacts.io';
import { isBalancedAutomationSafe, normalizeArtifactText } from './artifacts.queue';
import { isRuntimeExternalSignal } from './cert-helpers';
import { evaluateOverclaimPass, hasOpenGovernedValidationGap } from './overclaim-guard';
import type { PulseArtifactSnapshot } from './artifacts';
import type { OverclaimGovernedValidationEvidence } from './overclaim-guard';
import type { PulseAutonomyState, PulseConvergencePlan } from './types';
import type { QueueUnit } from './artifacts.queue';
import type { AuthorityMode } from './types.authority-mode';
import { REQUIRED_NON_REGRESSING_CYCLES } from './cert-gate-multi-cycle';

export type AuthorityState = {
  mode: AuthorityMode;
  advisoryOnly: boolean;
  automationEligible: boolean;
  reasons: string[];
};

export type AutonomyReadiness = {
  verdict: 'SIM' | 'NAO';
  mode: 'complete' | 'autonomous_next_step' | 'blocked';
  verdictScope: 'production_autonomy' | 'next_autonomous_step';
  canWorkNow: boolean;
  canContinueUntilReady: boolean;
  canDeclareComplete: boolean;
  automationSafeUnits: number;
  blockers: string[];
  warnings: string[];
};

export type CycleProof = {
  requiredCycles: number;
  totalRecordedCycles: number;
  realExecutedCycles: number;
  successfulNonRegressingCycles: number;
  runtimeTouchingCycles: number;
  executionMatrixComparedCycles: number;
  executionMatrixRegressedCycles: number;
  proven: boolean;
};

type MatrixSummaryKey =
  | 'observedPass'
  | 'observedFail'
  | 'untested'
  | 'blockedHumanRequired'
  | 'unreachable'
  | 'inferredOnly'
  | 'unknownPaths'
  | 'criticalUnobservedPaths'
  | 'impreciseBreakpoints';

type MatrixSummarySnapshot = Partial<Record<MatrixSummaryKey, number>>;

const MATRIX_NON_REGRESSION_RULES: Array<{
  key: MatrixSummaryKey;
  direction: 'increase' | 'decrease';
}> = [
  { key: 'observedPass', direction: 'increase' },
  { key: 'observedFail', direction: 'decrease' },
  { key: 'untested', direction: 'decrease' },
  { key: 'blockedHumanRequired', direction: 'decrease' },
  { key: 'unreachable', direction: 'decrease' },
  { key: 'inferredOnly', direction: 'decrease' },
  { key: 'unknownPaths', direction: 'decrease' },
  { key: 'criticalUnobservedPaths', direction: 'decrease' },
  { key: 'impreciseBreakpoints', direction: 'decrease' },
];

function hasValidatableAiSafeUnit(convergencePlan: PulseConvergencePlan): boolean {
  return convergencePlan.queue.some(
    (unit) =>
      isBalancedAutomationSafe(unit) &&
      unit.validationArtifacts.length > 0 &&
      unit.exitCriteria.length > 0,
  );
}

function isGovernedValidationExecutionMode(mode: QueueUnit['executionMode']): boolean {
  return mode === 'observation_only' || mode === 'governed_validation' || mode === 'human_required';
}

function countOpenGovernedValidationUnits(
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null,
): number {
  const summaryCount = Math.max(
    convergencePlan.summary.humanRequiredUnits,
    convergencePlan.summary.observationOnlyUnits,
  );
  const queueCount = convergencePlan.queue.filter(
    (unit) =>
      isGovernedValidationExecutionMode(unit.executionMode) &&
      (unit.status === 'open' || unit.status === 'watch'),
  ).length;
  const previousStateCount = Math.max(
    previousAutonomyState?.governedSandboxUnits ?? 0,
    previousAutonomyState?.escalatedValidationUnits ?? 0,
    previousAutonomyState?.observationOnlyUnits ?? 0,
  );
  return Math.max(summaryCount, queueCount, previousStateCount);
}

function countExecutionMatrixGovernedValidationGates(snapshot: PulseArtifactSnapshot): number {
  const summary = snapshot.executionMatrix?.summary;
  if (!summary) {
    return 0;
  }
  const legacyBlocked = Math.max(
    summary.blockedHumanRequired ?? 0,
    summary.byStatus?.blocked_human_required ?? 0,
  );
  const observationOnly = Math.max(
    summary.observationOnlyRequired ?? 0,
    summary.byStatus?.observation_only ?? 0,
  );
  return legacyBlocked + observationOnly;
}

function buildGovernedValidationEvidence(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  previousAutonomyState: PulseAutonomyState | null,
): OverclaimGovernedValidationEvidence {
  const openUnitCount = countOpenGovernedValidationUnits(convergencePlan, previousAutonomyState);
  const openGateCount = countExecutionMatrixGovernedValidationGates(snapshot);
  const blockers = snapshot.certification.dynamicBlockingReasons.filter((reason) =>
    /governed[ _-]?validation|observation[ _-]?only|protected[ _-]?surface|human_required|blocked_human_required/i.test(
      reason,
    ),
  );
  return {
    openUnitCount,
    openGateCount,
    blockers,
  };
}

export type PulseMachineReadinessGateName =
  | 'boundedRunPass'
  | 'artifactConsistencyPass'
  | 'executionMatrixPass'
  | 'criticalPathTerminalPass'
  | 'breakpointPrecisionPass'
  | 'externalSignalsPass'
  | 'directiveActionabilityPass'
  | 'selfTrustPass'
  | 'multiCycleConvergencePass';

export type PulseMachineReadinessGate = {
  status: 'pass' | 'fail';
  reason: string;
};

export type PulseMachineReadiness = {
  generatedAt: string;
  status: 'READY' | 'NOT_READY';
  canDeclarePulseComplete: boolean;
  authorityMode: AuthorityMode;
  gates: Record<PulseMachineReadinessGateName, PulseMachineReadinessGate>;
  blockers: string[];
  summary: {
    totalGates: number;
    passingGates: number;
    failingGates: number;
    executionMatrixPaths: number;
    criticalUnobservedPaths: number;
    impreciseBreakpoints: number;
    automationSafeUnits: number;
    successfulNonRegressingCycles: number;
    requiredCycles: number;
  };
};

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

function hasRuntimeTouchingValidationEvidence(
  entry: PulseAutonomyState['history'][number],
): boolean {
  if (!entry.codex.executed || !entry.validation.executed) {
    return false;
  }
  return entry.validation.commands.some(
    (command) => command.command.trim().length > 0 && command.exitCode === 0,
  );
}
