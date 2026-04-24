import type { PulseExecutionEvidence } from './types';

export function mergeExecutionEvidence(
  defaults: PulseExecutionEvidence,
  overrides?: Partial<PulseExecutionEvidence>,
): PulseExecutionEvidence {
  if (!overrides) return defaults;
  return {
    runtime: {
      ...defaults.runtime,
      ...(overrides.runtime || {}),
      executedChecks: overrides.runtime?.executedChecks || defaults.runtime.executedChecks,
      blockingBreakTypes:
        overrides.runtime?.blockingBreakTypes || defaults.runtime.blockingBreakTypes,
      artifactPaths: overrides.runtime?.artifactPaths || defaults.runtime.artifactPaths,
      probes: overrides.runtime?.probes || defaults.runtime.probes,
    },
    browser: {
      ...defaults.browser,
      ...(overrides.browser || {}),
      artifactPaths: overrides.browser?.artifactPaths || defaults.browser.artifactPaths,
    },
    flows: {
      ...defaults.flows,
      ...(overrides.flows || {}),
      declared: overrides.flows?.declared || defaults.flows.declared,
      executed: overrides.flows?.executed || defaults.flows.executed,
      missing: overrides.flows?.missing || defaults.flows.missing,
      passed: overrides.flows?.passed || defaults.flows.passed,
      failed: overrides.flows?.failed || defaults.flows.failed,
      accepted: overrides.flows?.accepted || defaults.flows.accepted,
      artifactPaths: overrides.flows?.artifactPaths || defaults.flows.artifactPaths,
      results: overrides.flows?.results || defaults.flows.results,
    },
    invariants: {
      ...defaults.invariants,
      ...(overrides.invariants || {}),
      declared: overrides.invariants?.declared || defaults.invariants.declared,
      evaluated: overrides.invariants?.evaluated || defaults.invariants.evaluated,
      missing: overrides.invariants?.missing || defaults.invariants.missing,
      passed: overrides.invariants?.passed || defaults.invariants.passed,
      failed: overrides.invariants?.failed || defaults.invariants.failed,
      accepted: overrides.invariants?.accepted || defaults.invariants.accepted,
      artifactPaths: overrides.invariants?.artifactPaths || defaults.invariants.artifactPaths,
      results: overrides.invariants?.results || defaults.invariants.results,
    },
    observability: {
      ...defaults.observability,
      ...(overrides.observability || {}),
      artifactPaths: overrides.observability?.artifactPaths || defaults.observability.artifactPaths,
      signals: { ...defaults.observability.signals, ...(overrides.observability?.signals || {}) },
    },
    recovery: {
      ...defaults.recovery,
      ...(overrides.recovery || {}),
      artifactPaths: overrides.recovery?.artifactPaths || defaults.recovery.artifactPaths,
      signals: { ...defaults.recovery.signals, ...(overrides.recovery?.signals || {}) },
    },
    customer: {
      ...defaults.customer,
      ...(overrides.customer || {}),
      declared: overrides.customer?.declared || defaults.customer.declared,
      executed: overrides.customer?.executed || defaults.customer.executed,
      missing: overrides.customer?.missing || defaults.customer.missing,
      passed: overrides.customer?.passed || defaults.customer.passed,
      failed: overrides.customer?.failed || defaults.customer.failed,
      artifactPaths: overrides.customer?.artifactPaths || defaults.customer.artifactPaths,
      results: overrides.customer?.results || defaults.customer.results,
    },
    operator: {
      ...defaults.operator,
      ...(overrides.operator || {}),
      declared: overrides.operator?.declared || defaults.operator.declared,
      executed: overrides.operator?.executed || defaults.operator.executed,
      missing: overrides.operator?.missing || defaults.operator.missing,
      passed: overrides.operator?.passed || defaults.operator.passed,
      failed: overrides.operator?.failed || defaults.operator.failed,
      artifactPaths: overrides.operator?.artifactPaths || defaults.operator.artifactPaths,
      results: overrides.operator?.results || defaults.operator.results,
    },
    admin: {
      ...defaults.admin,
      ...(overrides.admin || {}),
      declared: overrides.admin?.declared || defaults.admin.declared,
      executed: overrides.admin?.executed || defaults.admin.executed,
      missing: overrides.admin?.missing || defaults.admin.missing,
      passed: overrides.admin?.passed || defaults.admin.passed,
      failed: overrides.admin?.failed || defaults.admin.failed,
      artifactPaths: overrides.admin?.artifactPaths || defaults.admin.artifactPaths,
      results: overrides.admin?.results || defaults.admin.results,
    },
    soak: {
      ...defaults.soak,
      ...(overrides.soak || {}),
      declared: overrides.soak?.declared || defaults.soak.declared,
      executed: overrides.soak?.executed || defaults.soak.executed,
      missing: overrides.soak?.missing || defaults.soak.missing,
      passed: overrides.soak?.passed || defaults.soak.passed,
      failed: overrides.soak?.failed || defaults.soak.failed,
      artifactPaths: overrides.soak?.artifactPaths || defaults.soak.artifactPaths,
      results: overrides.soak?.results || defaults.soak.results,
    },
    syntheticCoverage: {
      ...defaults.syntheticCoverage,
      ...(overrides.syntheticCoverage || {}),
      artifactPaths:
        overrides.syntheticCoverage?.artifactPaths || defaults.syntheticCoverage.artifactPaths,
      uncoveredPages:
        overrides.syntheticCoverage?.uncoveredPages || defaults.syntheticCoverage.uncoveredPages,
      results: overrides.syntheticCoverage?.results || defaults.syntheticCoverage.results,
    },
    worldState: {
      ...defaults.worldState,
      ...(overrides.worldState || {}),
      actorProfiles: overrides.worldState?.actorProfiles || defaults.worldState.actorProfiles,
      executedScenarios:
        overrides.worldState?.executedScenarios || defaults.worldState.executedScenarios,
      pendingAsyncExpectations:
        overrides.worldState?.pendingAsyncExpectations ||
        defaults.worldState.pendingAsyncExpectations,
      sessions: overrides.worldState?.sessions || defaults.worldState.sessions,
    },
    executionTrace: {
      ...defaults.executionTrace,
      ...(overrides.executionTrace || {}),
      phases: overrides.executionTrace?.phases || defaults.executionTrace.phases,
      artifactPaths:
        overrides.executionTrace?.artifactPaths || defaults.executionTrace.artifactPaths,
    },
  };
}
