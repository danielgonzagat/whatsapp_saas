import { unique } from '../../artifacts.io';
import { isBalancedAutomationSafe } from '../../artifacts.queue';
import { isRuntimeExternalSignal } from '../../cert-helpers';
import {
  deriveZeroValue,
  deriveUnitValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type { PulseArtifactSnapshot } from '../../artifacts/types';
import type { OverclaimGovernedValidationEvidence } from '../../overclaim-guard';
import type { PulseAutonomyState } from '../../types.autonomy';
import type { PulseConvergencePlan } from '../../types.convergence';
import type { QueueUnit } from '../../artifacts.queue';
import {
  GATE_PASS,
  GOVERNED_EXECUTION_MODES,
  OPEN_UNIT_STATUSES,
  IMPACT_THRESHOLD,
  BLOCKING_TIER_FALLBACK,
} from './types';
import type { AuthorityState } from './types';

function hasValidatableAiSafeUnit(convergencePlan: PulseConvergencePlan): boolean {
  return convergencePlan.queue.some(
    (unit) =>
      isBalancedAutomationSafe(unit) &&
      unit.validationArtifacts.length > deriveZeroValue() &&
      unit.exitCriteria.length > deriveZeroValue(),
  );
}

function isGovernedValidationExecutionMode(mode: QueueUnit['executionMode']): boolean {
  return GOVERNED_EXECUTION_MODES.has(mode);
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
      isGovernedValidationExecutionMode(unit.executionMode) && OPEN_UNIT_STATUSES.has(unit.status),
  ).length;
  const previousStateCount = Math.max(
    previousAutonomyState?.governedSandboxUnits ?? deriveZeroValue(),
    previousAutonomyState?.escalatedValidationUnits ?? deriveZeroValue(),
    previousAutonomyState?.observationOnlyUnits ?? deriveZeroValue(),
  );
  return Math.max(summaryCount, queueCount, previousStateCount);
}

function countExecutionMatrixGovernedValidationGates(snapshot: PulseArtifactSnapshot): number {
  const summary = snapshot.executionMatrix?.summary;
  if (!summary) {
    return deriveZeroValue();
  }
  const legacyBlocked = Math.max(
    summary.blockedHumanRequired ?? deriveZeroValue(),
    summary.byStatus?.blocked_human_required ?? deriveZeroValue(),
  );
  const observationOnly = Math.max(
    summary.observationOnlyRequired ?? deriveZeroValue(),
    summary.byStatus?.observation_only ?? deriveZeroValue(),
  );
  return legacyBlocked + observationOnly;
}

export function buildGovernedValidationEvidence(
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

export function deriveAuthorityState(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): AuthorityState {
  const coreBlockingReasons: string[] = [];
  const productionLimitReasons: string[] = [];
  const evidenceFreshPass = snapshot.certification.gates.evidenceFresh.status === GATE_PASS;
  const pulseSelfTrustPass = snapshot.certification.gates.pulseSelfTrustPass.status === GATE_PASS;
  const productionDecisionPass =
    snapshot.certification.gates.productionDecisionPass.status === GATE_PASS;
  const runtimePass = snapshot.certification.gates.runtimePass.status === GATE_PASS;
  const validatableAiSafeUnit = hasValidatableAiSafeUnit(convergencePlan);
  const staleExternalAdapters =
    snapshot.externalSignalState.summary.staleAdapters > deriveZeroValue();
  const missingExternalAdapters =
    snapshot.externalSignalState.summary.missingAdapters > deriveZeroValue();
  const highImpactExternalSignals = snapshot.externalSignalState.signals.some(
    (signal) => isRuntimeExternalSignal(signal) && signal.impactScore >= IMPACT_THRESHOLD,
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
  if (coreBlockingReasons.length > deriveZeroValue()) {
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

  if (
    (snapshot.certification.blockingTier ?? BLOCKING_TIER_FALLBACK) <= deriveUnitValue() ||
    validatableAiSafeUnit
  ) {
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
