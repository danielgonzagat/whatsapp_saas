import { describe, expect, it } from 'vitest';

import { getArtifactName } from '../actors/coverage';
import { canExecuteScenario } from '../actors/scenario-evaluator';
import { inferActorArtifact } from '../actors/scenario-result';
import { buildWorldState } from '../actors/world-state';
import type {
  PulseCodebaseTruth,
  PulseManifestScenarioSpec,
  PulseResolvedManifest,
  PulseRuntimeEvidence,
  PulseScenarioResult,
} from '../types';
import type { RunSyntheticActorsInput } from '../actors';

function makeScenario(overrides: Partial<PulseManifestScenarioSpec>): PulseManifestScenarioSpec {
  return {
    id: overrides.id ?? 'scenario-1',
    actorKind: overrides.actorKind ?? 'customer',
    scenarioKind: overrides.scenarioKind ?? 'single-session',
    critical: overrides.critical ?? true,
    moduleKeys: overrides.moduleKeys ?? [],
    routePatterns: overrides.routePatterns ?? [],
    flowSpecs: overrides.flowSpecs ?? [],
    flowGroups: overrides.flowGroups ?? [],
    playwrightSpecs: overrides.playwrightSpecs ?? [],
    runtimeProbes: overrides.runtimeProbes ?? [],
    requiresBrowser: overrides.requiresBrowser ?? false,
    requiresPersistence: overrides.requiresPersistence ?? false,
    asyncExpectations: overrides.asyncExpectations ?? [],
    providerMode: overrides.providerMode ?? 'sandbox',
    timeWindowModes: overrides.timeWindowModes ?? ['total'],
    runner: overrides.runner ?? 'derived',
    executionMode: overrides.executionMode ?? 'derived',
    worldStateKeys: overrides.worldStateKeys ?? [],
    requiredArtifacts: overrides.requiredArtifacts ?? [],
    notes: overrides.notes ?? 'test scenario',
  };
}

function makeScenarioResult(
  scenario: PulseManifestScenarioSpec,
  overrides: Partial<PulseScenarioResult> = {},
): PulseScenarioResult {
  return {
    scenarioId: scenario.id,
    actorKind: scenario.actorKind,
    scenarioKind: scenario.scenarioKind,
    critical: scenario.critical,
    requested: true,
    runner: scenario.runner,
    status: 'passed',
    executed: true,
    providerModeUsed: scenario.providerMode,
    smokeExecuted: false,
    replayExecuted: false,
    worldStateConverged: true,
    summary: 'passed',
    artifactPaths: [],
    specsExecuted: [],
    durationMs: 0,
    worldStateTouches: scenario.worldStateKeys,
    moduleKeys: scenario.moduleKeys,
    routePatterns: scenario.routePatterns,
    ...overrides,
  };
}

function makeWorldStateInput(scenarios: PulseManifestScenarioSpec[]): RunSyntheticActorsInput {
  const resolvedManifest = {
    actorProfiles: [
      {
        id: 'dynamic-buyer',
        kind: 'customer',
        description: 'dynamic buyer',
        moduleFocus: [],
        defaultTimeWindowModes: ['total'],
      },
    ],
    scenarioSpecs: scenarios,
    modules: [],
    flowGroups: [],
  } as PulseResolvedManifest;

  return {
    rootDir: process.cwd(),
    environment: 'scan',
    manifest: null,
    resolvedManifest,
    codebaseTruth: { pages: [], discoveredFlows: [] } as unknown as PulseCodebaseTruth,
    runtimeEvidence: { probes: [] } as unknown as PulseRuntimeEvidence,
    browserEvidence: { attempted: false, executed: false, artifactPaths: [], summary: 'not run' },
    flowEvidence: {
      declared: [],
      executed: [],
      missing: [],
      passed: [],
      failed: [],
      accepted: [],
      artifactPaths: [],
      summary: 'not run',
      results: [],
    },
  };
}

describe('PULSE actor/mode consumers derive from registry semantics', () => {
  it('routes soak by scenario time window rather than actor name allowlists', () => {
    const scenario = makeScenario({
      id: 'buyer-long-run',
      actorKind: 'customer',
      timeWindowModes: ['shift', 'soak'],
    });

    expect(canExecuteScenario(scenario, new Set(['soak']))).toBe(true);
    expect(canExecuteScenario(scenario, new Set(['operator']))).toBe(false);
    expect(inferActorArtifact(scenario)).toBe('soak');
    expect(getArtifactName('system')).toBe('PULSE_SOAK_EVIDENCE.json');
  });

  it('builds world-state sessions from manifested evidence keys', () => {
    const customerScenario = makeScenario({ id: 'buyer-checkout', actorKind: 'customer' });
    const soakScenario = makeScenario({
      id: 'buyer-reconciliation',
      actorKind: 'customer',
      timeWindowModes: ['soak'],
    });
    const worldState = buildWorldState(makeWorldStateInput([customerScenario, soakScenario]), [
      makeScenarioResult(customerScenario),
      makeScenarioResult(soakScenario),
    ]);

    expect(worldState.sessions).toEqual([
      { kind: 'customer', declaredScenarios: 1, executedScenarios: 1, passedScenarios: 1 },
      { kind: 'system', declaredScenarios: 1, executedScenarios: 1, passedScenarios: 1 },
    ]);
  });
});
