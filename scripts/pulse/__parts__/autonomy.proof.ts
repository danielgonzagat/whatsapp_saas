import { unique } from '../artifacts.io';
import { normalizeArtifactText } from '../artifacts.queue';
import { evaluateOverclaimPass, hasOpenGovernedValidationGap } from '../overclaim-guard';
import type { PulseArtifactSnapshot } from '../artifacts';
import type { PulseAutonomyState, PulseConvergencePlan } from '../types';
import type { QueueUnit } from '../artifacts.queue';
import type { AuthorityState } from './autonomy.types';
import { buildAutonomyCycleProof, buildGovernedValidationEvidence } from './autonomy.helpers';

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
