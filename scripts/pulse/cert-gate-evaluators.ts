/**
 * Gate evaluator functions: gateFail, evidenceFresh, scope, truthExtraction,
 * pulseSelfTrust, static, runtime, changeRisk.
 * All functions are pure — no I/O, no side effects.
 */
import type {
  PulseCapabilityState,
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
  PulseExecutionTrace,
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
  selfTrustReport?: {
    checks?: Array<{
      id: string;
      name?: string;
      pass: boolean;
      reason?: string;
      severity?: 'critical' | 'high' | 'medium';
    }>;
  } | null,
  executionTrace?: PulseExecutionTrace,
): PulseGateResult {
  const passedParserPhases = new Set(
    (executionTrace?.phases ?? [])
      .filter((phase) => phase.phase.startsWith('parser:') && phase.phaseStatus === 'passed')
      .map((phase) => phase.phase.replace(/^parser:/, '')),
  );
  const executionFailures = (executionTrace?.phases ?? []).filter(
    (phase) =>
      phase.phase.startsWith('parser:') &&
      (phase.phaseStatus === 'failed' || phase.phaseStatus === 'timed_out'),
  );
  const parserDiagnostics = new Map<string, { kind: string; reason: string }>();

  for (const unavailable of parserInventory.unavailableChecks) {
    if (passedParserPhases.has(unavailable.name)) {
      continue;
    }
    parserDiagnostics.set(unavailable.name, {
      kind: 'load_unavailable',
      reason: unavailable.reason,
    });
  }

  for (const phase of executionFailures) {
    const parserName = phase.phase.replace(/^parser:/, '');
    parserDiagnostics.set(parserName, {
      kind: phase.phaseStatus === 'timed_out' ? 'execution_timeout' : 'execution_failed',
      reason: phase.errorSummary ?? 'Parser execution failed without an error summary.',
    });
  }

  if (parserDiagnostics.size > 0) {
    const details = [...parserDiagnostics.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, diagnostic]) => `${name} [${diagnostic.kind}]: ${diagnostic.reason}`)
      .join(' | ');
    return gateFail(
      `Parser self-trust failed for ${parserDiagnostics.size} current parser check(s): ${details}`,
      'checker_gap',
    );
  }

  // Cross-artifact consistency: if PULSE artifacts disagree on shared
  // fields (status, verdicts, counters, generatedAt), self-trust must fail
  // even when capabilities/flows look healthy. Divergent artifacts mean
  // PULSE cannot reliably describe its own state.
  const consistencyCheck = selfTrustReport?.checks?.find(
    (c) => c.id === 'cross-artifact-consistency',
  );
  if (consistencyCheck && !consistencyCheck.pass) {
    return gateFail(
      `Cross-artifact consistency failed: ${consistencyCheck.reason ?? 'PULSE artifacts disagree on shared fields'}.`,
      'checker_gap',
    );
  }

  const executionTraceAuditCheck = selfTrustReport?.checks?.find(
    (c) => c.id === 'execution-trace-audit-trail',
  );
  if (executionTraceAuditCheck && !executionTraceAuditCheck.pass) {
    return gateFail(
      `${executionTraceAuditCheck.name ?? 'Execution trace audit trail'} failed: ${executionTraceAuditCheck.reason ?? 'Execution trace audit trail is not trustworthy'}.`,
      'checker_gap',
    );
  }

  const parserHardcodedAuditCheck = selfTrustReport?.checks?.find(
    (c) => c.id === 'parser-hardcoded-finding-audit',
  );
  if (parserHardcodedAuditCheck && !parserHardcodedAuditCheck.pass) {
    return gateFail(
      `${parserHardcodedAuditCheck.name ?? 'Parser hardcoded finding audit'} failed: ${parserHardcodedAuditCheck.reason ?? 'Parser Break emitters contain hardcoded final-truth risk'}.`,
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
      `Runtime evidence found blocking runtime events: ${evidence.runtime.blockingBreakTypes.join(', ')}.`,
      'product_failure',
    );
  }

  return {
    status: 'pass',
    reason: evidence.runtime.summary || 'Runtime evidence executed without blocking findings.',
  };
}
import "./__companions__/cert-gate-evaluators.companion";
