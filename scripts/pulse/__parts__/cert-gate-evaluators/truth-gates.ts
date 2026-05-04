import type {
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseFlowProjection,
  PulseResolvedManifest,
  PulseScopeState,
} from '../../types';
import { gateFail } from './gate-fail';

/**
 * Gate evaluator functions: truthExtraction + pulseSelfTrust.
 * Extracted to keep cert-gate-evaluators.ts under 400 lines.
 */

export function evaluateTruthExtractionGate(
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
  scopeState: PulseScopeState,
  capabilityState?: PulseCapabilityState,
  flowProjection?: PulseFlowProjection,
): import('../../types').PulseGateResult {
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
  parserInventory: import('../../types').PulseParserInventory,
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
  executionTrace?: import('../../types').PulseExecutionTrace,
): import('../../types').PulseGateResult {
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
