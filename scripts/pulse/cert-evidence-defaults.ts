/**
 * Default evidence builders and mergeExecutionEvidence for PULSE certification.
 * These functions produce the baseline PulseExecutionEvidence when no real
 * evidence is attached, then merge in any real evidence from the current run.
 */
import type {
  PulseActorEvidence,
  PulseBrowserEvidence,
  PulseCertificationTarget,
  PulseCodebaseTruth,
  PulseEnvironment,
  PulseExecutionEvidence,
  PulseExecutionTrace,
  PulseFlowEvidence,
  PulseFlowResult,
  PulseHealth,
  PulseInvariantEvidence,
  PulseInvariantResult,
  PulseManifest,
  PulseObservabilityEvidence,
  PulseParserInventory,
  PulseRecoveryEvidence,
  PulseResolvedManifest,
} from './types';
import { RUNTIME_PATTERNS } from './cert-constants';
import {
  filterBlockingBreaks,
  matchesAny,
  inferRuntimeCheckNames,
  summarizeBreakTypes,
  getApplicableFlowIds,
  getApplicableInvariantIds,
  getAcceptedTargetIds,
  getActiveTemporaryAcceptances,
} from './cert-helpers';
import {
  buildDefaultActorEvidence,
  buildDefaultSyntheticCoverage,
  buildDefaultWorldState,
} from './cert-evidence-actor';

export {
  buildDefaultActorEvidence,
  buildDefaultSyntheticCoverage,
  buildDefaultWorldState,
} from './cert-evidence-actor';

export function buildDefaultFlowEvidence(
  manifest: PulseManifest | null,
  env: PulseEnvironment,
): PulseFlowEvidence {
  const declared = getApplicableFlowIds(manifest, env);
  const accepted = getAcceptedTargetIds(manifest, 'flow').filter((id) => declared.includes(id));
  const missing = declared.filter((id) => !accepted.includes(id));
  const artifactPaths = declared.length > 0 ? ['PULSE_FLOW_EVIDENCE.json'] : [];
  const results: PulseFlowResult[] = declared.map((flowId) => {
    if (accepted.includes(flowId)) {
      const entry = getActiveTemporaryAcceptances(manifest).find(
        (item) => item.targetType === 'flow' && item.target === flowId,
      );
      return {
        flowId,
        status: 'accepted',
        executed: false,
        accepted: true,
        summary: entry
          ? `Temporarily accepted until ${entry.expiresAt}: ${entry.reason}`
          : 'Temporarily accepted by manifest.',
        artifactPaths,
      };
    }
    return {
      flowId,
      status: 'missing_evidence',
      executed: false,
      accepted: false,
      failureClass: 'missing_evidence',
      summary: `No formal flow evidence is attached for ${flowId}.`,
      artifactPaths,
    };
  });
  return {
    declared,
    executed: [],
    missing,
    passed: [],
    failed: [],
    accepted,
    artifactPaths,
    summary:
      declared.length > 0
        ? `No formal flow evidence is attached for ${missing.length} declared flow(s).`
        : 'No flow specs are required in the current environment.',
    results,
  };
}

export function buildDefaultInvariantEvidence(
  manifest: PulseManifest | null,
  env: PulseEnvironment,
): PulseInvariantEvidence {
  const declared = getApplicableInvariantIds(manifest, env);
  const accepted = getAcceptedTargetIds(manifest, 'invariant').filter((id) =>
    declared.includes(id),
  );
  const missing = declared.filter((id) => !accepted.includes(id));
  const artifactPaths = declared.length > 0 ? ['PULSE_INVARIANT_EVIDENCE.json'] : [];
  const results: PulseInvariantResult[] = declared.map((invariantId) => {
    if (accepted.includes(invariantId)) {
      const entry = getActiveTemporaryAcceptances(manifest).find(
        (item) => item.targetType === 'invariant' && item.target === invariantId,
      );
      return {
        invariantId,
        status: 'accepted',
        evaluated: false,
        accepted: true,
        summary: entry
          ? `Temporarily accepted until ${entry.expiresAt}: ${entry.reason}`
          : 'Temporarily accepted by manifest.',
        artifactPaths,
      };
    }
    return {
      invariantId,
      status: 'missing_evidence',
      evaluated: false,
      accepted: false,
      failureClass: 'missing_evidence',
      summary: `No formal invariant evidence is attached for ${invariantId}.`,
      artifactPaths,
    };
  });
  return {
    declared,
    evaluated: [],
    missing,
    passed: [],
    failed: [],
    accepted,
    artifactPaths,
    summary:
      declared.length > 0
        ? `No formal invariant evidence is attached for ${missing.length} declared invariant(s).`
        : 'No invariant specs are required in the current environment.',
    results,
  };
}

export function buildDefaultObservabilityEvidence(
  env: PulseEnvironment,
): PulseObservabilityEvidence {
  return {
    executed: env !== 'scan',
    artifactPaths: env === 'scan' ? [] : ['PULSE_OBSERVABILITY_EVIDENCE.json'],
    summary:
      env === 'scan'
        ? 'Observability evidence was not attached in scan mode.'
        : 'Observability evidence was not attached yet.',
    signals: {
      tracingHeadersDetected: false,
      requestIdMiddlewareDetected: false,
      structuredLoggingDetected: false,
      sentryDetected: false,
      alertingIntegrationDetected: false,
      healthEndpointsDetected: false,
      auditTrailDetected: false,
    },
  };
}

export function buildDefaultRecoveryEvidence(env: PulseEnvironment): PulseRecoveryEvidence {
  return {
    executed: env !== 'scan',
    artifactPaths: env === 'scan' ? [] : ['PULSE_RECOVERY_EVIDENCE.json'],
    summary:
      env === 'scan'
        ? 'Recovery evidence was not attached in scan mode.'
        : 'Recovery evidence was not attached yet.',
    signals: {
      backupManifestPresent: false,
      backupPolicyPresent: false,
      backupValidationPresent: false,
      restoreRunbookPresent: false,
      disasterRecoveryRunbookPresent: false,
      disasterRecoveryTestPresent: false,
      seedScriptPresent: false,
    },
  };
}

export function buildDefaultExecutionTrace(
  env: PulseEnvironment,
  target: PulseCertificationTarget,
): PulseExecutionTrace {
  const timestamp = new Date().toISOString();
  return {
    runId: `pulse-cert-${Date.now()}`,
    generatedAt: timestamp,
    updatedAt: timestamp,
    environment: env,
    certificationTarget: target,
    phases: [],
    summary: 'Execution trace not attached.',
    artifactPaths: ['PULSE_EXECUTION_TRACE.json'],
  };
}

function buildRuntimeEvidence(
  env: PulseEnvironment,
  parserInventory: PulseParserInventory,
  health: PulseHealth,
  runtimeBreaks: import('./types').Break[],
) {
  if (env === 'scan') {
    return {
      executed: false,
      executedChecks: [],
      blockingBreakTypes: [],
      artifactPaths: [],
      summary: 'Runtime evidence was not collected in scan mode.',
      probes: [],
    };
  }
  return {
    executed: true,
    executedChecks: inferRuntimeCheckNames(parserInventory),
    blockingBreakTypes: summarizeBreakTypes(runtimeBreaks),
    artifactPaths: [],
    summary:
      runtimeBreaks.length > 0
        ? `Runtime evidence executed with ${runtimeBreaks.length} blocking runtime finding(s).`
        : 'Runtime evidence executed without blocking runtime findings.',
    probes: [],
  };
}

export function buildDefaultEvidence(
  env: PulseEnvironment,
  manifest: PulseManifest | null,
  parserInventory: PulseParserInventory,
  health: PulseHealth,
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
  target: PulseCertificationTarget,
): PulseExecutionEvidence {
  const runtimeBreaks = filterBlockingBreaks(
    health.breaks,
    (item) => matchesAny(item.type, RUNTIME_PATTERNS),
    manifest,
  );
  const runtime = buildRuntimeEvidence(env, parserInventory, health, runtimeBreaks);
  const browser: PulseBrowserEvidence =
    env === 'total'
      ? {
          attempted: false,
          executed: false,
          artifactPaths: [],
          summary: 'Total mode requires browser evidence, but none has been attached yet.',
          failureCode: undefined,
        }
      : {
          attempted: false,
          executed: false,
          artifactPaths: [],
          summary: 'Browser certification is not required in this environment.',
          failureCode: 'ok',
        };
  const customer = buildDefaultActorEvidence('customer', resolvedManifest);
  const operator = buildDefaultActorEvidence('operator', resolvedManifest);
  const admin = buildDefaultActorEvidence('admin', resolvedManifest);
  const soak = buildDefaultActorEvidence('soak', resolvedManifest);
  return {
    runtime,
    browser,
    flows: buildDefaultFlowEvidence(manifest, env),
    invariants: buildDefaultInvariantEvidence(manifest, env),
    observability: buildDefaultObservabilityEvidence(env),
    recovery: buildDefaultRecoveryEvidence(env),
    customer,
    operator,
    admin,
    soak,
    syntheticCoverage: buildDefaultSyntheticCoverage(codebaseTruth, resolvedManifest),
    worldState: buildDefaultWorldState(resolvedManifest, {
      runtime,
      customer,
      operator,
      admin,
      soak,
    }),
    executionTrace: buildDefaultExecutionTrace(env, target),
  };
}

export { mergeExecutionEvidence } from './cert-evidence-merge';
