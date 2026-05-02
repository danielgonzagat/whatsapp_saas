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

export function buildAutonomyCycleProof(
  previousAutonomyState: PulseAutonomyState | null,
): CycleProof {
  const history = previousAutonomyState?.history || [];
  const realExecutedCycles = history.filter((entry) => entry.codex.executed);
  const runtimeTouchingCycles = realExecutedCycles.filter(hasRuntimeTouchingValidationEvidence);
  const executionMatrixComparisons = realExecutedCycles.map((entry) =>
    evaluateCycleExecutionMatrixNonRegression(entry),
  );
  const successfulCycles = realExecutedCycles.filter((entry) => {
    const codexPassed = entry.codex.exitCode === 0;
    const validationPassed =
      entry.validation.executed &&
      entry.validation.commands.length > 0 &&
      entry.validation.commands.every((command) => command.exitCode === 0);
    const beforeScore =
      typeof entry.directiveBefore.score === 'number' ? entry.directiveBefore.score : null;
    const afterScore =
      typeof entry.directiveAfter?.score === 'number' ? entry.directiveAfter.score : null;
    const scoreNonRegressing =
      beforeScore === null || afterScore === null || afterScore >= beforeScore;
    const beforeTier =
      typeof entry.directiveBefore.blockingTier === 'number'
        ? entry.directiveBefore.blockingTier
        : null;
    const afterTier =
      typeof entry.directiveAfter?.blockingTier === 'number'
        ? entry.directiveAfter.blockingTier
        : null;
    const tierNonRegressing = beforeTier === null || afterTier === null || afterTier <= beforeTier;
    const matrix = evaluateCycleExecutionMatrixNonRegression(entry);
    const runtimeTouched = hasRuntimeTouchingValidationEvidence(entry);
    return (
      codexPassed &&
      validationPassed &&
      runtimeTouched &&
      scoreNonRegressing &&
      tierNonRegressing &&
      matrix.nonRegressing
    );
  });

  return {
    requiredCycles: REQUIRED_NON_REGRESSING_CYCLES,
    totalRecordedCycles: history.length,
    realExecutedCycles: realExecutedCycles.length,
    successfulNonRegressingCycles: successfulCycles.length,
    runtimeTouchingCycles: runtimeTouchingCycles.length,
    executionMatrixComparedCycles: executionMatrixComparisons.filter((result) => result.compared)
      .length,
    executionMatrixRegressedCycles: executionMatrixComparisons.filter(
      (result) => !result.nonRegressing,
    ).length,
    proven: successfulCycles.length >= REQUIRED_NON_REGRESSING_CYCLES,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMatrixSummary(candidate: unknown): MatrixSummarySnapshot | null {
  const object = asObject(candidate);
  if (!object) return null;
  const summaryObject = asObject(object.summary) || object;
  const summary: MatrixSummarySnapshot = {};
  for (const rule of MATRIX_NON_REGRESSION_RULES) {
    const value = summaryObject[rule.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      summary[rule.key] = value;
    }
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

function readCycleMatrixSummary(
  entry: PulseAutonomyState['history'][number],
  phase: 'before' | 'after',
): MatrixSummarySnapshot | null {
  const object = asObject(entry);
  const directive =
    phase === 'before' ? asObject(entry.directiveBefore) : asObject(entry.directiveAfter);
  const suffix = phase === 'before' ? 'Before' : 'After';
  const candidates = [
    object?.[`executionMatrix${suffix}`],
    object?.[`executionMatrixSummary${suffix}`],
    directive?.executionMatrix,
    directive?.executionMatrixSummary,
    asObject(directive?.currentState)?.executionMatrixSummary,
  ];
  for (const candidate of candidates) {
    const summary = readMatrixSummary(candidate);
    if (summary) return summary;
  }
  return null;
}

function evaluateCycleExecutionMatrixNonRegression(entry: PulseAutonomyState['history'][number]): {
  compared: boolean;
  nonRegressing: boolean;
} {
  const before = readCycleMatrixSummary(entry, 'before');
  const after = readCycleMatrixSummary(entry, 'after');
  if (!before || !after) {
    return { compared: false, nonRegressing: true };
  }
  for (const rule of MATRIX_NON_REGRESSION_RULES) {
    const beforeValue = before[rule.key];
    const afterValue = after[rule.key];
    if (beforeValue === undefined || afterValue === undefined) continue;
    if (rule.direction === 'increase' && afterValue < beforeValue) {
      return { compared: true, nonRegressing: false };
    }
    if (rule.direction === 'decrease' && afterValue > beforeValue) {
      return { compared: true, nonRegressing: false };
    }
  }
  return { compared: true, nonRegressing: true };
}

function pass(reason: string): PulseMachineReadinessGate {
  return { status: 'pass', reason };
}

function fail(reason: string): PulseMachineReadinessGate {
  return { status: 'fail', reason };
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

export function buildAutonomyProof(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  authority: AuthorityState,
  autonomyQueue: QueueUnit[],
  previousAutonomyState: PulseAutonomyState | null,
) {
  const firstUnit = autonomyQueue[0] || null;
  const profile = snapshot.certification.certificationTarget.profile || undefined;
  const invalidAdapters = snapshot.externalSignalState.summary.invalidAdapters;
  const externalAdaptersClosed =
    snapshot.externalSignalState.summary.missingAdapters === 0 &&
    snapshot.externalSignalState.summary.staleAdapters === 0 &&
    invalidAdapters === 0;
  const isPulseCoreFinal = profile === 'pulse-core-final';
  const structuralDebtClosed = isPulseCoreFinal
    ? snapshot.certification.status === 'CERTIFIED' &&
      snapshot.certification.humanReplacementStatus === 'READY'
    : snapshot.parityGaps.summary.totalGaps === 0 &&
      snapshot.codacyEvidence.summary.highIssues === 0 &&
      snapshot.capabilityState.summary.phantomCapabilities === 0 &&
      snapshot.flowProjection.summary.phantomFlows === 0;
  const cycleProof = buildAutonomyCycleProof(previousAutonomyState);
  const governedValidationEvidence = buildGovernedValidationEvidence(
    snapshot,
    convergencePlan,
    previousAutonomyState,
  );
  const governedValidationGapOpen = hasOpenGovernedValidationGap(governedValidationEvidence);
  const productionAutonomy =
    authority.mode === 'certified-autonomous' &&
    snapshot.certification.status === 'CERTIFIED' &&
    externalAdaptersClosed &&
    structuralDebtClosed &&
    !governedValidationGapOpen &&
    cycleProof.proven;
  const nextStepAutonomy = Boolean(
    firstUnit && firstUnit.validationArtifacts.length > 0 && firstUnit.exitCriteria.length > 0,
  );
  const canWorkNow = nextStepAutonomy && authority.automationEligible;
  const canContinueUntilReady =
    canWorkNow && externalAdaptersClosed && !governedValidationGapOpen && cycleProof.proven;
  const zeroPromptProductionGuidance = canContinueUntilReady;
  const structuralDebtBlocker = !structuralDebtClosed
    ? `${snapshot.parityGaps.summary.totalGaps} parity gap(s), ${snapshot.codacyEvidence.summary.highIssues} HIGH Codacy issue(s), ${snapshot.capabilityState.summary.phantomCapabilities} phantom capability(ies), and ${snapshot.flowProjection.summary.phantomFlows} phantom flow(s) remain.`
    : '';
  const externalAdapterBlocker = !externalAdaptersClosed
    ? `${snapshot.externalSignalState.summary.missingAdapters} missing, ${snapshot.externalSignalState.summary.staleAdapters} stale, and ${invalidAdapters} invalid external adapter(s) remain.`
    : '';
  const cycleProofBlocker = !cycleProof.proven
    ? `Autonomous convergence history is not proven: ${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} successful non-regressing real cycle(s).`
    : '';
  const governedValidationOpenCount = Math.max(
    governedValidationEvidence.openUnitCount,
    governedValidationEvidence.openGateCount,
  );
  const governedValidationBlocker = governedValidationGapOpen
    ? `${governedValidationOpenCount} governed validation gap(s) remain observation-only or protected-surface work.`
    : '';

  const overclaimCheck = evaluateOverclaimPass({
    verdicts: {
      nextStepAutonomy: nextStepAutonomy ? 'SIM' : 'NAO',
      zeroPromptProductionGuidance: zeroPromptProductionGuidance ? 'SIM' : 'NAO',
      productionAutonomy: productionAutonomy ? 'SIM' : 'NAO',
      canDeclareComplete: productionAutonomy,
    },
    gateStatus: {
      structuralDebtClosed,
      cycleProofPassed: cycleProof.proven,
      externalAdaptersClosed,
      governedValidationEvidence,
      authorityAutomationEligible: authority.automationEligible,
      nextStepAvailable: nextStepAutonomy,
      canContinueUntilReady,
    },
  });

  const authorityProductionBlockers = authority.automationEligible ? [] : authority.reasons;
  const zeroPromptBlockers = unique(
    [
      !nextStepAutonomy ? 'No ai_safe executable unit is available for a fresh session.' : '',
      !authority.automationEligible
        ? `Authority is not automation-eligible: ${authority.reasons.join(' | ') || authority.mode}.`
        : '',
      externalAdapterBlocker,
      governedValidationBlocker,
      cycleProofBlocker,
      ...overclaimCheck.violations,
    ]
      .filter(Boolean)
      .map(normalizeArtifactText),
  ).slice(0, 16);
  const productionBlockers = unique(
    [
      ...authorityProductionBlockers,
      authority.mode !== 'certified-autonomous'
        ? `Authority mode is ${authority.mode}, not certified-autonomous.`
        : '',
      snapshot.certification.status !== 'CERTIFIED'
        ? `Certification status is ${snapshot.certification.status}, not CERTIFIED.`
        : '',
      externalAdapterBlocker,
      structuralDebtBlocker,
      governedValidationBlocker,
      cycleProofBlocker,
      ...snapshot.certification.dynamicBlockingReasons,
      ...overclaimCheck.violations,
    ]
      .filter(Boolean)
      .map(normalizeArtifactText),
  ).slice(0, 16);
  const productionAutonomyReason = productionAutonomy
    ? [
        'SIM: authority is certified-autonomous',
        'certification is CERTIFIED',
        'required external adapters are closed',
        'structural debt is closed',
        `${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} real runtime-touching non-regressing cycle(s) are proven`,
      ].join('; ')
    : `NAO: ${productionBlockers.join(' | ') || 'production autonomy criteria are not closed.'}`;
  const zeroPromptProductionGuidanceReason = zeroPromptProductionGuidance
    ? [
        'SIM: fresh session has an executable ai_safe unit',
        'authority is automation-eligible',
        'required external adapters are closed',
        'governed validation gaps are closed',
        `${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} real runtime-touching non-regressing cycle(s) are proven`,
      ].join('; ')
    : `NAO: ${
        zeroPromptBlockers.join(' | ') ||
        'fresh-session production guidance criteria are not closed.'
      }`;

  return {
    generatedAt: snapshot.certification.timestamp,
    freshSessionQuestion:
      'If a new AI session runs the full Pulse, will it know the next safe executable step?',
    freshSessionAnswer: nextStepAutonomy ? 'SIM' : 'NAO',
    productionAutonomyQuestion:
      'Can Pulse prove unsupervised convergence to fully functional and production-safe completion?',
    productionAutonomyAnswer: productionAutonomy ? 'SIM' : 'NAO',
    productionAutonomyReason,
    zeroPromptProductionGuidanceQuestion:
      'If a fresh AI session runs the full Pulse and is told to work autonomously, can it keep converging safely until production completion without manual intervention?',
    zeroPromptProductionGuidanceAnswer: zeroPromptProductionGuidance ? 'SIM' : 'NAO',
    zeroPromptProductionGuidanceReason,
    verdicts: {
      nextStepAutonomy: nextStepAutonomy ? 'SIM' : 'NAO',
      zeroPromptProductionGuidance: zeroPromptProductionGuidance ? 'SIM' : 'NAO',
      productionAutonomy: productionAutonomy ? 'SIM' : 'NAO',
      canWorkNow,
      canContinueUntilReady,
      canDeclareComplete: productionAutonomy,
    },
    authorityMode: authority.mode,
    advisoryOnly: authority.advisoryOnly,
    automationEligible: authority.automationEligible,
    firstExecutableUnit: firstUnit
      ? {
          id: firstUnit.id,
          kind: firstUnit.kind,
          priority: firstUnit.priority,
          productImpact: firstUnit.productImpact,
          executionMode: firstUnit.executionMode,
          title: firstUnit.title,
          validationArtifacts: firstUnit.validationArtifacts,
          exitCriteria: firstUnit.exitCriteria,
        }
      : null,
    criteria: [
      {
        id: 'guidance_executable',
        status: nextStepAutonomy ? 'pass' : 'fail',
        evidence: nextStepAutonomy
          ? `Next unit ${firstUnit?.id} is ai_safe and has ${firstUnit?.validationArtifacts.length || 0} validation artifact(s).`
          : 'No balanced ai_safe unit is exposed for a fresh AI session.',
      },
      {
        id: 'authority_closed',
        status:
          authority.mode === 'certified-autonomous' || authority.mode === 'autonomous-execution'
            ? 'pass'
            : 'fail',
        evidence: authority.reasons.join(' | ') || authority.mode,
      },
      {
        id: 'external_reality_fused',
        status: externalAdaptersClosed ? 'pass' : 'fail',
        evidence: `${snapshot.externalSignalState.summary.totalSignals} signal(s), ${snapshot.externalSignalState.summary.missingAdapters} missing adapter(s), ${snapshot.externalSignalState.summary.staleAdapters} stale adapter(s), ${invalidAdapters} invalid adapter(s).`,
      },
      {
        id: 'pulse_self_trust',
        status: snapshot.certification.gates.pulseSelfTrustPass.status === 'pass' ? 'pass' : 'fail',
        evidence: snapshot.certification.gates.pulseSelfTrustPass.reason,
      },
      {
        id: 'runtime_reality',
        status: snapshot.certification.gates.runtimePass.status === 'pass' ? 'pass' : 'fail',
        evidence: snapshot.certification.gates.runtimePass.reason,
      },
      {
        id: 'structural_debt_closed',
        status: structuralDebtClosed ? 'pass' : 'fail',
        evidence: `${snapshot.parityGaps.summary.totalGaps} parity gap(s), ${snapshot.codacyEvidence.summary.highIssues} HIGH Codacy issue(s), ${snapshot.capabilityState.summary.phantomCapabilities} phantom capability(ies), ${snapshot.flowProjection.summary.phantomFlows} phantom flow(s).`,
      },
      {
        id: 'multi_cycle_convergence',
        status: cycleProof.proven ? 'pass' : 'fail',
        evidence: `${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} successful runtime-touching non-regressing real autonomous cycle(s); ${cycleProof.runtimeTouchingCycles} runtime-touching cycle(s), ${cycleProof.realExecutedCycles} real executed cycle(s), ${cycleProof.totalRecordedCycles} recorded cycle(s), ${cycleProof.executionMatrixComparedCycles} execution-matrix comparison(s), ${cycleProof.executionMatrixRegressedCycles} execution-matrix regression(s).`,
      },
      {
        id: 'zero_prompt_production_guidance',
        status: zeroPromptProductionGuidance ? 'pass' : 'fail',
        evidence: zeroPromptProductionGuidance
          ? 'A fresh session has executable guidance, closed external reality, closed governed validation gaps, automation-eligible authority, and proven non-regressing cycles.'
          : 'Fresh-session production guidance remains NAO until executable guidance, closed external reality, closed governed validation gaps, automation-eligible authority, and proven non-regressing cycles are all true.',
      },
      {
        id: 'no_overclaim',
        status: overclaimCheck.pass ? 'pass' : 'fail',
        evidence: overclaimCheck.pass
          ? 'All verdicts are consistent with their supporting gates and evidence.'
          : overclaimCheck.violations.join(' | '),
      },
    ],
    blockersBeforeZeroPromptProductionGuidanceSim: zeroPromptBlockers,
    blockersBeforeProductionSim: productionBlockers,
    cycleProof,
    externalAdapterStatus: snapshot.externalSignalState.adapters.map((adapter) => ({
      source: adapter.source,
      status: adapter.status,
      requirement: adapter.requirement,
      required: adapter.required,
      observed: adapter.observed,
      blocking: adapter.blocking,
      proofBasis: adapter.proofBasis,
      executed: adapter.executed,
      signalCount: adapter.signals.length,
      reason: adapter.reason,
    })),
    requiredBeforeSim: [
      'Close Pulse self-trust and production decision gates.',
      'Fuse all required external adapters or provide fresh canonical snapshots.',
      'Convert observation-only or protected-surface gaps into executable governed validation.',
      'Reduce structural parity gaps, phantom capabilities/flows, and HIGH Codacy issues to the certified threshold before declaring completion.',
      'Record at least 3 real autonomous cycles with runtime-touching validation, no score/tier regression, and no execution-matrix regression when matrix snapshots exist.',
    ],
  };
}
