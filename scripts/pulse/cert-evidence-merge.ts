import type { PulseActorEvidence, PulseExecutionEvidence } from './types';

type ActorEvidenceKey = 'customer' | 'operator' | 'admin' | 'soak';

const ACTOR_EVIDENCE_KEYS: ActorEvidenceKey[] = ['customer', 'operator', 'admin', 'soak'];

function mergeActorArrayField<K extends keyof PulseActorEvidence>(
  overrides: PulseActorEvidence | undefined,
  defaults: PulseActorEvidence,
  key: K,
): PulseActorEvidence[K] {
  return overrides?.[key] || defaults[key];
}

function mergeActorEvidence(
  key: ActorEvidenceKey,
  defaults: PulseExecutionEvidence,
  overrides: Partial<PulseExecutionEvidence>,
): PulseExecutionEvidence[ActorEvidenceKey] {
  const defaultEvidence = defaults[key];
  const overrideEvidence = overrides[key];
  return {
    ...defaultEvidence,
    ...(overrideEvidence || {}),
    declared: mergeActorArrayField(overrideEvidence, defaultEvidence, 'declared'),
    executed: mergeActorArrayField(overrideEvidence, defaultEvidence, 'executed'),
    missing: mergeActorArrayField(overrideEvidence, defaultEvidence, 'missing'),
    passed: mergeActorArrayField(overrideEvidence, defaultEvidence, 'passed'),
    failed: mergeActorArrayField(overrideEvidence, defaultEvidence, 'failed'),
    artifactPaths: mergeActorArrayField(overrideEvidence, defaultEvidence, 'artifactPaths'),
    results: mergeActorArrayField(overrideEvidence, defaultEvidence, 'results'),
  };
}

export function mergeExecutionEvidence(
  defaults: PulseExecutionEvidence,
  overrides?: Partial<PulseExecutionEvidence>,
): PulseExecutionEvidence {
  if (!overrides) return defaults;
  const actorEvidence = Object.fromEntries(
    ACTOR_EVIDENCE_KEYS.map((key) => [key, mergeActorEvidence(key, defaults, overrides)]),
  ) as Pick<PulseExecutionEvidence, ActorEvidenceKey>;
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
    ...actorEvidence,
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
