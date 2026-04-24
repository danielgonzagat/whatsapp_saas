/**
 * Actor, synthetic-coverage, pattern, and scoring gate evaluators.
 * Also contains computeScore, buildTierStatuses, and getBlockingTier.
 * All functions are pure — no I/O, no side effects.
 */
import type {
  PulseActorEvidence,
  PulseExecutionEvidence,
  PulseGateName,
  PulseGateResult,
  PulseManifest,
  PulseManifestCertificationTier,
  PulseCertificationTierStatus,
} from './types';
import {
  getAcceptedCriticalFlows,
  getPendingCriticalScenarios,
  worldStateHasPendingCriticalExpectations,
  chooseStructuredFailureClass,
} from './cert-helpers';
import { GATE_ORDER } from './cert-constants';
import { gateFail } from './cert-gate-evaluators';

export { chooseStructuredFailureClass };

export function evaluateFlowGate(
  evidence: PulseExecutionEvidence,
  manifest: PulseManifest | null,
  requireNoAcceptedCritical: boolean,
): PulseGateResult {
  if (evidence.flows.declared.length === 0) {
    return {
      status: 'pass',
      reason: 'No critical flows are required in the current environment.',
    };
  }

  const acceptedCriticalFlows = requireNoAcceptedCritical
    ? getAcceptedCriticalFlows(manifest, evidence)
    : [];
  if (acceptedCriticalFlows.length > 0) {
    return gateFail(
      `Critical flows remain temporarily accepted and must execute before certification: ${acceptedCriticalFlows.join(', ')}.`,
      'missing_evidence',
    );
  }

  const blocking = evidence.flows.results.filter(
    (item) => item.status === 'failed' || item.status === 'missing_evidence',
  );
  if (blocking.length === 0) {
    return {
      status: 'pass',
      reason: evidence.flows.summary || 'All declared critical flows have evidence.',
    };
  }

  const failureClass = chooseStructuredFailureClass(blocking);
  const affectedIds = blocking.map((item) => item.flowId).join(', ');
  return gateFail(
    failureClass === 'missing_evidence'
      ? `Critical flow evidence is missing for: ${affectedIds}.`
      : `Critical flows are failing: ${affectedIds}.`,
    failureClass,
  );
}

export function evaluateInvariantGate(evidence: PulseExecutionEvidence): PulseGateResult {
  if (evidence.invariants.declared.length === 0) {
    return {
      status: 'pass',
      reason: 'No critical invariants are required in the current environment.',
    };
  }

  const blocking = evidence.invariants.results.filter(
    (item) => item.status === 'failed' || item.status === 'missing_evidence',
  );
  if (blocking.length === 0) {
    return {
      status: 'pass',
      reason: evidence.invariants.summary || 'Invariant evidence is complete.',
    };
  }

  const failureClass = chooseStructuredFailureClass(blocking);
  const affectedIds = blocking.map((item) => item.invariantId).join(', ');
  return gateFail(
    failureClass === 'missing_evidence'
      ? `Invariant evidence is missing for: ${affectedIds}.`
      : `Invariant checks are failing: ${affectedIds}.`,
    failureClass,
  );
}

export function evaluateActorGate(
  label: string,
  evidence: PulseActorEvidence,
  requireCriticalExecution: boolean,
): PulseGateResult {
  if (evidence.declared.length === 0) {
    return gateFail(`No ${label} scenarios are declared in the resolved manifest.`, 'checker_gap');
  }

  if (requireCriticalExecution) {
    const skipped = evidence.results.filter((item) => item.critical && item.status === 'skipped');
    if (skipped.length > 0) {
      return gateFail(
        `${label} synthetic execution is still missing for: ${skipped.map((item) => item.scenarioId).join(', ')}.`,
        'missing_evidence',
      );
    }
  }

  const blocking = evidence.results.filter(
    (item) =>
      item.critical &&
      (item.status === 'failed' ||
        item.status === 'missing_evidence' ||
        item.status === 'checker_gap'),
  );
  if (blocking.length === 0) {
    return {
      status: 'pass',
      reason: evidence.summary || `${label} synthetic actor scenarios passed.`,
    };
  }

  const failureClass = chooseStructuredFailureClass(blocking);
  const affectedIds = blocking.map((item) => item.scenarioId).join(', ');
  return gateFail(
    failureClass === 'missing_evidence'
      ? `${label} synthetic evidence is missing for: ${affectedIds}.`
      : failureClass === 'checker_gap'
        ? `${label} synthetic scenarios have checker gaps: ${affectedIds}.`
        : `${label} synthetic scenarios are failing: ${affectedIds}.`,
    failureClass,
  );
}

export function evaluateSyntheticCoverageGate(evidence: PulseExecutionEvidence): PulseGateResult {
  if (!evidence.syntheticCoverage.executed) {
    return gateFail(
      evidence.syntheticCoverage.summary || 'Synthetic coverage evidence was not generated.',
      'missing_evidence',
    );
  }

  if (evidence.syntheticCoverage.uncoveredPages.length > 0) {
    return gateFail(
      `Synthetic coverage still misses ${evidence.syntheticCoverage.uncoveredPages.length} page(s): ${evidence.syntheticCoverage.uncoveredPages.join(', ')}.`,
      'checker_gap',
    );
  }

  return {
    status: 'pass',
    reason:
      evidence.syntheticCoverage.summary ||
      'All discovered user-facing surfaces are mapped to scenarios.',
  };
}

export function computeScore(
  rawScore: number,
  gates: Record<PulseGateName, PulseGateResult>,
): number {
  const passed = GATE_ORDER.filter((gateName) => gates[gateName].status === 'pass').length;
  const gateScore = Math.round((passed / GATE_ORDER.length) * 100);
  if (passed === GATE_ORDER.length) return 100;
  return Math.max(0, Math.min(rawScore, gateScore));
}

export function buildTierStatuses(
  tiers: PulseManifestCertificationTier[],
  gates: Record<PulseGateName, PulseGateResult>,
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): PulseCertificationTierStatus[] {
  const acceptedCriticalFlows = getAcceptedCriticalFlows(manifest, evidence);
  const pendingCriticalScenarios = getPendingCriticalScenarios(evidence);
  const hasPendingCriticalWorldState = worldStateHasPendingCriticalExpectations(evidence);

  return tiers.map((tier) => {
    const blockingGates = tier.gates.filter((gateName) => gates[gateName]?.status === 'fail');
    const extraFailures: string[] = [];

    if (tier.requireNoAcceptedFlows && acceptedCriticalFlows.length > 0) {
      extraFailures.push(`accepted flows: ${acceptedCriticalFlows.join(', ')}`);
    }
    if (tier.requireNoAcceptedScenarios && pendingCriticalScenarios.length > 0) {
      extraFailures.push(`pending critical scenarios: ${pendingCriticalScenarios.join(', ')}`);
    }
    if (tier.requireWorldStateConvergence && hasPendingCriticalWorldState) {
      extraFailures.push('critical async expectations still pending in world state');
    }

    const status = blockingGates.length === 0 && extraFailures.length === 0 ? 'pass' : 'fail';
    const reason =
      status === 'pass'
        ? `${tier.name} passed all hard gate requirements.`
        : [
            blockingGates.length > 0 ? `blocking gates: ${blockingGates.join(', ')}` : '',
            ...extraFailures,
          ]
            .filter(Boolean)
            .join('; ');

    return {
      id: tier.id,
      name: tier.name,
      status,
      gates: tier.gates,
      blockingGates,
      reason,
    };
  });
}

export function getBlockingTier(tierStatuses: PulseCertificationTierStatus[]): number | null {
  const first = tierStatuses.find((tier) => tier.status === 'fail');
  return first ? first.id : null;
}
