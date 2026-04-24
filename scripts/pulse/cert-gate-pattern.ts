/**
 * Pattern-based, production-decision, recovery, observability gate evaluators,
 * and withTemporaryGateAcceptance helper.
 * All functions are pure — no I/O, no side effects.
 */
import type {
  PulseCodacyIssue,
  PulseEnvironment,
  PulseExecutionEvidence,
  PulseExternalSignalState,
  PulseCapabilityState,
  PulseFlowProjection,
  PulseGateName,
  PulseGateResult,
  PulseHealth,
  PulseManifest,
} from './types';
import {
  filterBlockingBreaks,
  matchesAny,
  summarizeBreakTypes,
  summarizeCodacyFiles,
  isGateAccepted,
  acceptedGatePass,
  summarizeExternalSignalIds,
} from './cert-helpers';
import { RECOVERY_PATTERNS, OBSERVABILITY_PATTERNS } from './cert-constants';
import { gateFail } from './cert-gate-evaluators';

export function evaluatePatternGate(
  gateName: PulseGateName,
  passReason: string,
  failReason: string,
  health: PulseHealth,
  manifest: PulseManifest | null,
  patterns: RegExp[],
  codacyIssues: PulseCodacyIssue[] = [],
): PulseGateResult {
  const blockingBreaks = filterBlockingBreaks(
    health.breaks,
    (item) => matchesAny(item.type, patterns),
    manifest,
  );

  if (blockingBreaks.length === 0 && codacyIssues.length === 0) {
    return { status: 'pass', reason: passReason };
  }

  if (isGateAccepted(manifest, gateName)) {
    return acceptedGatePass(manifest, gateName);
  }

  return gateFail(
    `${failReason} Blocking types: ${[
      ...summarizeBreakTypes(blockingBreaks),
      ...summarizeCodacyFiles(codacyIssues),
    ].join(', ')}.`,
    'product_failure',
  );
}

export function evaluateProductionDecisionGate(
  externalSignalState: PulseExternalSignalState | undefined,
  capabilityState: PulseCapabilityState | undefined,
  flowProjection: PulseFlowProjection | undefined,
): PulseGateResult {
  if (!externalSignalState) {
    return {
      status: 'pass',
      reason: 'No external production-decision state was attached for this run.',
    };
  }

  const unmappedHighImpact = externalSignalState.signals
    .filter((signal) => signal.impactScore >= 0.8)
    .filter(
      (signal) =>
        signal.capabilityIds.length === 0 &&
        signal.flowIds.length === 0 &&
        signal.relatedFiles.length === 0,
    );

  if (unmappedHighImpact.length > 0) {
    return gateFail(
      `High-impact external signals are not mapped to actionable product surfaces: ${summarizeExternalSignalIds(unmappedHighImpact).join(', ')}.`,
      'checker_gap',
    );
  }

  const mappedSurfaceCount = new Set([
    ...(capabilityState?.capabilities
      .filter((capability) =>
        externalSignalState.signals.some((signal) => signal.capabilityIds.includes(capability.id)),
      )
      .map((capability) => capability.id) || []),
    ...(flowProjection?.flows
      .filter((flow) =>
        externalSignalState.signals.some((signal) => signal.flowIds.includes(flow.id)),
      )
      .map((flow) => flow.id) || []),
  ]).size;

  if (externalSignalState.summary.totalSignals > 0 && mappedSurfaceCount === 0) {
    return gateFail(
      'External signals exist but the reconstructed product surface does not expose any actionable capability or flow gap.',
      'checker_gap',
    );
  }

  return {
    status: 'pass',
    reason:
      externalSignalState.summary.totalSignals > 0
        ? 'Observed external signals are mapped to actionable capabilities or flows.'
        : 'No external signal currently blocks production decision-making.',
    evidenceMode: externalSignalState.summary.totalSignals > 0 ? 'observed' : 'inferred',
    confidence: externalSignalState.summary.mappedSignals > 0 ? 'high' : 'medium',
  };
}

export function evaluateRecoveryGate(
  env: PulseEnvironment,
  health: PulseHealth,
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): PulseGateResult {
  if (!evidence.recovery.executed) {
    return gateFail(
      evidence.recovery.summary ||
        (env === 'scan'
          ? 'Recovery evidence was not exercised in scan mode.'
          : 'Recovery evidence was not collected.'),
      'missing_evidence',
    );
  }
  return evaluatePatternGate(
    'recoveryPass',
    'Recovery and rollback requirements have no blocking findings in this run.',
    'Recovery certification found blocking findings.',
    health,
    manifest,
    RECOVERY_PATTERNS,
  );
}

export function evaluateObservabilityGate(
  health: PulseHealth,
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): PulseGateResult {
  if (!evidence.observability.executed) {
    return gateFail(
      evidence.observability.summary || 'Observability evidence was not collected.',
      'missing_evidence',
    );
  }
  return evaluatePatternGate(
    'observabilityPass',
    'Observability and audit requirements have no blocking findings in this run.',
    'Observability certification found blocking findings.',
    health,
    manifest,
    OBSERVABILITY_PATTERNS,
  );
}

export function withTemporaryGateAcceptance(
  gateName: PulseGateName,
  manifest: PulseManifest | null,
  result: PulseGateResult,
): PulseGateResult {
  if (result.status === 'fail' && isGateAccepted(manifest, gateName)) {
    return acceptedGatePass(manifest, gateName);
  }
  return result;
}
