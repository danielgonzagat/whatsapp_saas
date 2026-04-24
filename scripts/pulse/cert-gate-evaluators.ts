/**
 * Gate evaluator functions: gateFail, evidenceFresh, scope, truthExtraction,
 * pulseSelfTrust, static, runtime, changeRisk.
 * All functions are pure — no I/O, no side effects.
 */
import type {
  PulseCapabilityState,
  PulseCertificationTarget,
  PulseCodebaseTruth,
  PulseCodacySummary,
  PulseEnvironment,
  PulseExecutionEvidence,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseGateFailureClass,
  PulseGateResult,
  PulseHealth,
  PulseManifest,
  PulseParserInventory,
  PulseResolvedManifest,
  PulseScopeState,
} from './types';
import {
  filterBlockingBreaks,
  isRuntimeExternalSignal,
  summarizeExternalSignalIds,
  chooseStructuredFailureClass,
} from './cert-helpers';

export function gateFail(
  reason: string,
  failureClass: PulseGateFailureClass,
  options?: {
    affectedCapabilityIds?: string[];
    affectedFlowIds?: string[];
    evidenceMode?: 'observed' | 'inferred' | 'aspirational';
    confidence?: 'high' | 'medium' | 'low';
  },
): PulseGateResult {
  return {
    status: 'fail',
    reason,
    failureClass,
    affectedCapabilityIds: options?.affectedCapabilityIds,
    affectedFlowIds: options?.affectedFlowIds,
    evidenceMode: options?.evidenceMode,
    confidence: options?.confidence,
  };
}

export function evaluateEvidenceFreshGate(
  evidence: PulseExecutionEvidence,
  codacy: PulseCodacySummary,
  externalSignalState?: PulseExternalSignalState,
): PulseGateResult {
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

export function evaluateScopeGate(scopeState: PulseScopeState): PulseGateResult {
  if (scopeState.parity.status === 'pass') {
    return { status: 'pass', reason: scopeState.parity.reason };
  }
  return gateFail(scopeState.parity.reason, 'checker_gap');
}

export function evaluateTruthExtractionGate(
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
  scopeState: PulseScopeState,
  capabilityState?: PulseCapabilityState,
  flowProjection?: PulseFlowProjection,
): PulseGateResult {
  if (codebaseTruth.summary.totalPages === 0 || resolvedManifest.summary.totalModules === 0) {
    return gateFail(
      'Code-derived truth extraction did not discover frontend pages or modules.',
      'checker_gap',
    );
  }

  type CapSnapshot = PulseCapabilityState['capabilities'][number];
  const isMaterialTruthBlocker = (capability: CapSnapshot) => {
    const roles = new Set(capability.rolesPresent);
    return (
      capability.runtimeCritical &&
      (capability.status === 'phantom' || capability.status === 'latent') &&
      (capability.userFacing ||
        capability.routePatterns.length > 0 ||
        roles.has('interface') ||
        roles.has('persistence'))
    );
  };

  if (capabilityState && capabilityState.capabilities.some(isMaterialTruthBlocker)) {
    const affected = capabilityState.capabilities.filter(isMaterialTruthBlocker).slice(0, 6);
    return gateFail(
      `Runtime-critical product capabilities are still not materially real: ${affected.map((c) => c.name).join(', ')}.`,
      'checker_gap',
      {
        affectedCapabilityIds: affected.map((c) => c.id),
        evidenceMode: 'inferred',
        confidence: 'medium',
      },
    );
  }

  if (
    flowProjection &&
    flowProjection.flows.some((flow) => flow.status === 'phantom' && flow.distanceToReal > 0)
  ) {
    const affected = flowProjection.flows.filter((flow) => flow.status === 'phantom').slice(0, 6);
    return gateFail(
      `Projected flows still collapse into illusion instead of real chains: ${affected.map((f) => f.id).join(', ')}.`,
      'checker_gap',
      { affectedFlowIds: affected.map((f) => f.id), evidenceMode: 'inferred', confidence: 'low' },
    );
  }

  if (resolvedManifest.diagnostics.blockerCount > 0) {
    return gateFail(
      `Resolved manifest still has ${resolvedManifest.summary.unresolvedModules} unresolved module(s), ${resolvedManifest.summary.unresolvedFlowGroups} unresolved flow group(s), ${resolvedManifest.summary.orphanManualModules} orphan manual module(s), and ${resolvedManifest.summary.orphanFlowSpecs} orphan flow spec(s).`,
      'checker_gap',
    );
  }

  return {
    status: 'pass',
    reason: `Structural truth is materially coherent: ${resolvedManifest.summary.totalModules} module(s), ${resolvedManifest.summary.totalFlowGroups} flow group(s), and no runtime-critical product capability remains phantom or latent.`,
    evidenceMode: 'inferred',
    confidence: capabilityState ? 'medium' : 'low',
  };
}

export function evaluatePulseSelfTrustGate(
  parserInventory: PulseParserInventory,
  capabilityState?: PulseCapabilityState,
  flowProjection?: PulseFlowProjection,
): PulseGateResult {
  if (parserInventory.unavailableChecks.length > 0) {
    return gateFail(
      `Parser self-trust failed because ${parserInventory.unavailableChecks.length} check(s) could not load.`,
      'checker_gap',
    );
  }

  const phantomCapabilities =
    capabilityState?.capabilities.filter((c) => c.status === 'phantom').length || 0;
  const phantomFlows = flowProjection?.flows.filter((f) => f.status === 'phantom').length || 0;
  const aspirationalConfidence =
    (capabilityState?.capabilities || []).filter((c) => c.truthMode === 'aspirational').length +
    (flowProjection?.flows || []).filter((f) => f.truthMode === 'aspirational').length;

  if (phantomCapabilities > 0 || phantomFlows > 0) {
    return gateFail(
      `PULSE still reconstructs ${phantomCapabilities} phantom capability(ies) and ${phantomFlows} phantom flow(s); self-trust stays degraded until illusion collapses into real chains.`,
      'checker_gap',
    );
  }

  return {
    status: 'pass',
    reason:
      aspirationalConfidence > 0
        ? `All parsers loaded and no phantom capability/flow remains. ${aspirationalConfidence} aspirational structure(s) remain explicitly marked as aspirational.`
        : 'All parsers loaded successfully and the reconstructed system has no phantom capability/flow left.',
    evidenceMode: aspirationalConfidence > 0 ? 'aspirational' : 'inferred',
    confidence: 'high',
  };
}

export function evaluateStaticGate(
  health: PulseHealth,
  manifest: PulseManifest | null,
  codacy: PulseCodacySummary,
): PulseGateResult {
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
): PulseGateResult {
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
      `Runtime evidence found blocking break types: ${evidence.runtime.blockingBreakTypes.join(', ')}.`,
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
): PulseGateResult {
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

export function evaluateBrowserGate(
  env: PulseEnvironment,
  evidence: PulseExecutionEvidence,
  target: PulseCertificationTarget,
): PulseGateResult {
  if (env !== 'total') {
    return { status: 'pass', reason: 'Browser certification is not required in this environment.' };
  }

  if (target.profile === 'core-critical') {
    const browserCriticalScenarios = [
      ...evidence.customer.results,
      ...evidence.operator.results,
      ...evidence.admin.results,
      ...evidence.soak.results,
    ].filter(
      (result) => result.critical && result.requested && result.metrics?.requiresBrowser === true,
    );

    if (browserCriticalScenarios.length === 0) {
      return gateFail(
        'No browser-required critical scenarios were executed for the core-critical profile.',
        'missing_evidence',
      );
    }

    const blocking = browserCriticalScenarios.filter(
      (result) =>
        result.status === 'failed' ||
        result.status === 'missing_evidence' ||
        result.status === 'checker_gap' ||
        result.status === 'skipped',
    );

    if (blocking.length > 0) {
      const failureClass = chooseStructuredFailureClass(blocking);
      const affectedIds = blocking.map((result) => result.scenarioId).join(', ');
      return gateFail(
        failureClass === 'product_failure'
          ? `Browser-required critical scenarios are failing: ${affectedIds}.`
          : `Browser-required critical scenarios are missing evidence: ${affectedIds}.`,
        failureClass,
      );
    }

    return {
      status: 'pass',
      reason: `Browser-required critical scenarios passed: ${browserCriticalScenarios.map((result) => result.scenarioId).join(', ')}.`,
    };
  }

  if (!evidence.browser.attempted || !evidence.browser.executed) {
    return gateFail(
      evidence.browser.summary ||
        'Browser certification was required but did not produce evidence.',
      'missing_evidence',
    );
  }

  if ((evidence.browser.blockingInteractions || 0) > 0) {
    return gateFail(
      `${evidence.browser.blockingInteractions} blocking browser interaction(s) failed during total-mode certification.`,
      'product_failure',
    );
  }

  if ((evidence.browser.totalTested || 0) === 0) {
    return gateFail(
      'Browser run completed without testing interactive elements.',
      'missing_evidence',
    );
  }

  return {
    status: 'pass',
    reason: evidence.browser.summary || 'Browser certification passed.',
  };
}
