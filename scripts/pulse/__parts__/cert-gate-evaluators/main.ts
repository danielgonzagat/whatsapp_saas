import type {
  PulseCodacySummary,
  PulseEnvironment,
  PulseExecutionEvidence,
  PulseExternalSignalState,
  PulseHealth,
  PulseManifest,
} from '../../types';
import {
  filterBlockingBreaks,
  isRuntimeExternalSignal,
  summarizeExternalSignalIds,
  chooseStructuredFailureClass,
} from '../../cert-helpers';

import { gateFail } from './gate-fail';

export function evaluateEvidenceFreshGate(
  evidence: PulseExecutionEvidence,
  codacy: PulseCodacySummary,
  externalSignalState?: PulseExternalSignalState,
): import('../types').PulseGateResult {
  if (evidence.executionTrace.phases.length === 0) {
    return gateFail(
      'Execution trace is missing, so the certification run cannot prove which phases actually executed.',
      'missing_evidence',
    );
  }

  if (
    evidence.runtime.backendUrl &&
    evidence.worldState.backendUrl &&
    evidence.runtime.backendUrl !== evidence.worldState.backendUrl
  ) {
    return gateFail(
      'Runtime evidence and world state point to different backend URLs.',
      'checker_gap',
    );
  }
  if (
    evidence.runtime.frontendUrl &&
    evidence.worldState.frontendUrl &&
    evidence.runtime.frontendUrl !== evidence.worldState.frontendUrl
  ) {
    return gateFail(
      'Runtime evidence and world state point to different frontend URLs.',
      'checker_gap',
    );
  }

  const timedOutPhases = evidence.executionTrace.phases.filter(
    (phase) => phase.phaseStatus === 'timed_out',
  );
  if (timedOutPhases.length > 0) {
    return gateFail(
      `Execution trace contains timed out phases: ${timedOutPhases.map((phase) => phase.phase).join(', ')}.`,
      'missing_evidence',
    );
  }
  if (!codacy.snapshotAvailable || !codacy.syncedAt) {
    return gateFail(
      'Codacy snapshot is missing, so static quality evidence is not fresh enough for dynamic guidance.',
      'missing_evidence',
    );
  }
  if (codacy.stale) {
    return gateFail(
      `Codacy snapshot is stale (${codacy.ageMinutes} minute(s) old).`,
      'missing_evidence',
    );
  }
  const staleExternalAdapters =
    externalSignalState?.adapters.filter((adapter) => adapter.status === 'stale') || [];
  if (staleExternalAdapters.length > 0) {
    return gateFail(
      `External evidence adapters are stale: ${staleExternalAdapters.map((adapter) => adapter.source).join(', ')}.`,
      'missing_evidence',
    );
  }

  return {
    status: 'pass',
    reason: 'Execution trace and attached evidence are internally coherent for this run.',
  };
}

import type { PulseScopeState } from '../../types';

export function evaluateScopeGate(scopeState: PulseScopeState): import('../types').PulseGateResult {
  if (scopeState.parity.status === 'pass') {
    return { status: 'pass', reason: scopeState.parity.reason };
  }
  return gateFail(scopeState.parity.reason, 'checker_gap');
}

export function evaluateStaticGate(
  health: PulseHealth,
  manifest: PulseManifest | null,
  codacy: PulseCodacySummary,
): import('../types').PulseGateResult {
  const blockingBreaks = filterBlockingBreaks(health.breaks, undefined, manifest);
  if (blockingBreaks.length === 0 && codacy.severityCounts.HIGH === 0) {
    return {
      status: 'pass',
      reason: 'Static certification has no critical/high blocking findings.',
    };
  }
  return gateFail(
    `Static certification found ${blockingBreaks.length} critical/high scan finding(s) and Codacy still reports ${codacy.severityCounts.HIGH} HIGH issue(s).`,
    'product_failure',
  );
}

export function evaluateRuntimeGate(
  env: PulseEnvironment,
  evidence: PulseExecutionEvidence,
  externalSignalState?: PulseExternalSignalState,
): import('../types').PulseGateResult {
  const runtimeSignals =
    externalSignalState?.signals
      .filter(isRuntimeExternalSignal)
      .filter((signal) => signal.impactScore >= 0.75) || [];

  if (runtimeSignals.length > 0) {
    return gateFail(
      `Observed runtime signals remain active: ${summarizeExternalSignalIds(runtimeSignals).join(', ')}.`,
      'product_failure',
    );
  }

  if (env === 'scan' && !evidence.runtime.executed) {
    return gateFail(
      'Runtime evidence was not collected. Run PULSE with --deep or --total.',
      'missing_evidence',
    );
  }

  if (!evidence.runtime.executed) {
    return gateFail(
      evidence.runtime.summary ||
        'Runtime evidence is required in this mode, but it was not collected.',
      'missing_evidence',
    );
  }

  const requiredProbeFailures = evidence.runtime.probes.filter(
    (probe) => probe.required && (probe.status === 'failed' || probe.status === 'missing_evidence'),
  );
  if (requiredProbeFailures.length > 0) {
    const failureClass = chooseStructuredFailureClass(requiredProbeFailures);
    const affected = requiredProbeFailures.map((probe) => probe.probeId).join(', ');
    return gateFail(
      failureClass === 'missing_evidence'
        ? `Runtime probe evidence is missing for: ${affected}.`
        : `Runtime probes are failing: ${affected}.`,
      failureClass,
    );
  }

  if (evidence.runtime.blockingBreakTypes.length > 0) {
    return gateFail(
      `Runtime evidence found blocking runtime events: ${evidence.runtime.blockingBreakTypes.join(', ')}.`,
      'product_failure',
    );
  }

  return {
    status: 'pass',
    reason: evidence.runtime.summary || 'Runtime evidence executed without blocking findings.',
  };
}

export function evaluateChangeRiskGate(
  externalSignalState?: PulseExternalSignalState,
): import('../types').PulseGateResult {
  if (!externalSignalState) {
    return { status: 'pass', reason: 'No external change-risk state was attached for this run.' };
  }

  const correlatedSignals = externalSignalState.signals
    .filter((signal) => signal.recentChangeRefs.length > 0)
    .filter((signal) => signal.impactScore >= 0.7);

  if (correlatedSignals.length > 0) {
    return gateFail(
      `Recent changes correlate with active high-impact signals: ${summarizeExternalSignalIds(correlatedSignals).join(', ')}.`,
      'product_failure',
    );
  }

  return {
    status: 'pass',
    reason: 'No high-impact external signal is currently correlated with recent change evidence.',
    evidenceMode: externalSignalState.summary.totalSignals > 0 ? 'observed' : 'inferred',
    confidence: externalSignalState.summary.totalSignals > 0 ? 'high' : 'medium',
  };
}
