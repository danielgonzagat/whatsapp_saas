/**
 * Pulse artifact autonomy authority and proof builders.
 */
import { unique } from './artifacts.io';
import { isRuntimeExternalSignal } from './cert-helpers';
import { evaluateOverclaimPass } from './overclaim-guard';
import type { PulseArtifactSnapshot } from './artifacts';
import type { PulseAutonomyState, PulseConvergencePlan } from './types';
import type { QueueUnit } from './artifacts.queue';
import type { AuthorityMode } from './types.authority-mode';

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
  proven: boolean;
};

export function deriveAuthorityState(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): AuthorityState {
  const reasons: string[] = [];
  const evidenceFreshPass = snapshot.certification.gates.evidenceFresh.status === 'pass';
  const pulseSelfTrustPass = snapshot.certification.gates.pulseSelfTrustPass.status === 'pass';
  const productionDecisionPass =
    snapshot.certification.gates.productionDecisionPass.status === 'pass';
  const runtimePass = snapshot.certification.gates.runtimePass.status === 'pass';
  const staleExternalAdapters = snapshot.externalSignalState.summary.staleAdapters > 0;
  const missingExternalAdapters = snapshot.externalSignalState.summary.missingAdapters > 0;
  const highImpactExternalSignals = snapshot.externalSignalState.signals.some(
    (signal) => isRuntimeExternalSignal(signal) && signal.impactScore >= 0.75,
  );
  const humanRequiredOpen = convergencePlan.queue.some(
    (unit) =>
      unit.executionMode === 'human_required' &&
      (unit.priority === 'P0' || unit.priority === 'P1') &&
      unit.productImpact !== 'diagnostic',
  );

  if (!evidenceFreshPass) {
    reasons.push('Evidence freshness is not closed.');
  }
  if (!pulseSelfTrustPass) {
    reasons.push('Pulse self-trust is still failing.');
  }
  if (!productionDecisionPass) {
    reasons.push('Production decision gate is not passing.');
  }
  if (!runtimePass) {
    reasons.push('Runtime pass is not green with live evidence.');
  }
  if (staleExternalAdapters) {
    reasons.push(
      `${snapshot.externalSignalState.summary.staleAdapters} external adapter(s) are stale.`,
    );
  }
  if (missingExternalAdapters) {
    reasons.push(
      `${snapshot.externalSignalState.summary.missingAdapters} external adapter(s) are not configured.`,
    );
  }
  if (highImpactExternalSignals) {
    reasons.push(
      `${snapshot.externalSignalState.summary.highImpactSignals} high-impact external signal(s) remain active.`,
    );
  }
  if (humanRequiredOpen) {
    reasons.push('Human-required convergence units are still open.');
  }

  if (reasons.length > 0) {
    return {
      mode: 'advisory-only',
      advisoryOnly: true,
      automationEligible: false,
      reasons: unique(reasons),
    };
  }

  if (snapshot.certification.status === 'CERTIFIED') {
    return {
      mode: 'certified-autonomous',
      advisoryOnly: false,
      automationEligible: true,
      reasons: ['Certification is green with fresh evidence and no blocking human-required work.'],
    };
  }

  if ((snapshot.certification.blockingTier ?? 99) <= 1) {
    return {
      mode: 'autonomous-execution',
      advisoryOnly: false,
      automationEligible: true,
      reasons: ['Core trust/production gates are green; autonomous execution may proceed.'],
    };
  }

  return {
    mode: 'operator-gated',
    advisoryOnly: false,
    automationEligible: false,
    reasons: ['Core trust gates are green, but blocking tiers still require operator promotion.'],
  };
}

export function buildAutonomyReadiness(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  autonomyQueue: QueueUnit[],
): AutonomyReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (snapshot.certification.status === 'CERTIFIED') {
    return {
      verdict: 'SIM',
      mode: 'complete',
      verdictScope: 'production_autonomy',
      canWorkNow: false,
      canDeclareComplete: true,
      automationSafeUnits: 0,
      blockers,
      warnings: ['Current checkpoint is already certified; no autonomous work is required.'],
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
      `${convergencePlan.summary.humanRequiredUnits} human-required unit(s) remain blocked from autonomous mutation.`,
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
    canDeclareComplete: false,
    automationSafeUnits: autonomyQueue.length,
    blockers,
    warnings,
  };
}

export function buildAutonomyCycleProof(
  previousAutonomyState: PulseAutonomyState | null,
): CycleProof {
  const history = previousAutonomyState?.history || [];
  const realExecutedCycles = history.filter((entry) => entry.codex.executed);
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
    const nonRegressing = beforeScore === null || afterScore === null || afterScore >= beforeScore;
    return codexPassed && validationPassed && nonRegressing;
  });

  return {
    requiredCycles: 3,
    totalRecordedCycles: history.length,
    realExecutedCycles: realExecutedCycles.length,
    successfulNonRegressingCycles: successfulCycles.length,
    proven: successfulCycles.length >= 3,
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
  const invalidAdapters = snapshot.externalSignalState.adapters.filter(
    (adapter) => adapter.status === 'invalid',
  ).length;
  const externalAdaptersClosed =
    snapshot.externalSignalState.summary.missingAdapters === 0 &&
    snapshot.externalSignalState.summary.staleAdapters === 0 &&
    invalidAdapters === 0;
  const structuralDebtClosed =
    snapshot.parityGaps.summary.totalGaps === 0 &&
    snapshot.codacyEvidence.summary.highIssues === 0 &&
    snapshot.capabilityState.summary.phantomCapabilities === 0 &&
    snapshot.flowProjection.summary.phantomFlows === 0;
  const cycleProof = buildAutonomyCycleProof(previousAutonomyState);
  const productionAutonomy =
    authority.mode === 'certified-autonomous' &&
    snapshot.certification.status === 'CERTIFIED' &&
    externalAdaptersClosed &&
    structuralDebtClosed &&
    cycleProof.proven;
  const nextStepAutonomy = Boolean(firstUnit);
  const criticalHumanRequiredCount = convergencePlan.queue.filter(
    (unit) =>
      unit.executionMode === 'human_required' &&
      (unit.priority === 'P0' || unit.priority === 'P1') &&
      unit.productImpact !== 'diagnostic',
  ).length;
  const zeroPromptProductionGuidance =
    nextStepAutonomy &&
    authority.automationEligible &&
    externalAdaptersClosed &&
    structuralDebtClosed &&
    cycleProof.proven &&
    criticalHumanRequiredCount === 0;

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
      criticalHumanRequiredOpen: criticalHumanRequiredCount > 0,
      authorityAutomationEligible: authority.automationEligible,
      nextStepAvailable: nextStepAutonomy,
    },
  });

  const productionBlockers = unique(
    [
      ...authority.reasons,
      !externalAdaptersClosed
        ? `${snapshot.externalSignalState.summary.missingAdapters} missing, ${snapshot.externalSignalState.summary.staleAdapters} stale, and ${invalidAdapters} invalid external adapter(s) remain.`
        : '',
      !structuralDebtClosed
        ? `${snapshot.parityGaps.summary.totalGaps} parity gap(s), ${snapshot.codacyEvidence.summary.highIssues} HIGH Codacy issue(s), ${snapshot.capabilityState.summary.phantomCapabilities} phantom capability(ies), and ${snapshot.flowProjection.summary.phantomFlows} phantom flow(s) remain.`
        : '',
      !cycleProof.proven
        ? `Autonomous convergence history is not proven: ${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} successful non-regressing real cycle(s).`
        : '',
      ...snapshot.certification.dynamicBlockingReasons,
      ...overclaimCheck.violations,
    ].filter(Boolean),
  ).slice(0, 16);

  return {
    generatedAt: snapshot.certification.timestamp,
    freshSessionQuestion:
      'If a new AI session runs the full Pulse, will it know the next safe executable step?',
    freshSessionAnswer: nextStepAutonomy ? 'SIM' : 'NAO',
    productionAutonomyQuestion:
      'Can Pulse prove unsupervised convergence to fully functional and production-safe completion?',
    productionAutonomyAnswer: productionAutonomy ? 'SIM' : 'NAO',
    zeroPromptProductionGuidanceQuestion:
      'If a fresh AI session runs the full Pulse and is told to work autonomously, can it keep converging safely until production completion without human intervention?',
    zeroPromptProductionGuidanceAnswer: zeroPromptProductionGuidance ? 'SIM' : 'NAO',
    verdicts: {
      nextStepAutonomy: nextStepAutonomy ? 'SIM' : 'NAO',
      zeroPromptProductionGuidance: zeroPromptProductionGuidance ? 'SIM' : 'NAO',
      productionAutonomy: productionAutonomy ? 'SIM' : 'NAO',
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
        evidence: `${cycleProof.successfulNonRegressingCycles}/${cycleProof.requiredCycles} successful non-regressing real autonomous cycle(s); ${cycleProof.realExecutedCycles} real executed cycle(s), ${cycleProof.totalRecordedCycles} recorded cycle(s).`,
      },
      {
        id: 'zero_prompt_production_guidance',
        status: zeroPromptProductionGuidance ? 'pass' : 'fail',
        evidence: zeroPromptProductionGuidance
          ? 'A fresh session has executable guidance, closed external reality, automation-eligible authority, no human-required units, and proven non-regressing cycles.'
          : 'Fresh-session production guidance remains NAO until executable guidance, closed external reality, automation-eligible authority, zero human-required units, and proven non-regressing cycles are all true.',
      },
      {
        id: 'no_overclaim',
        status: overclaimCheck.pass ? 'pass' : 'fail',
        evidence: overclaimCheck.pass
          ? 'All verdicts are consistent with their supporting gates and evidence.'
          : overclaimCheck.violations.join(' | '),
      },
    ],
    blockersBeforeProductionSim: productionBlockers,
    cycleProof,
    externalAdapterStatus: snapshot.externalSignalState.adapters.map((adapter) => ({
      source: adapter.source,
      status: adapter.status,
      executed: adapter.executed,
      signalCount: adapter.signals.length,
      reason: adapter.reason,
    })),
    requiredBeforeSim: [
      'Close Pulse self-trust and production decision gates.',
      'Fuse all required external adapters or provide fresh canonical snapshots.',
      'Reduce structural parity gaps, phantom capabilities/flows, and HIGH Codacy issues to the certified threshold.',
      'Record at least 3 real autonomous cycles with successful validation and no score regression.',
    ],
  };
}
