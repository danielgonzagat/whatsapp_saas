import { describe, expect, it } from 'vitest';

import { buildObservationFootprint } from '../execution-observation';
import type {
  PulseActorEvidence,
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseScenarioResult,
} from '../types';

function makeManifest(): PulseResolvedManifest {
  return {
    generatedAt: '2026-04-30T00:00:00.000Z',
    sourceManifestPath: null,
    projectId: 'test',
    projectName: 'Test',
    systemType: 'web',
    supportedStacks: [],
    surfaces: [],
    criticalDomains: [],
    modules: [],
    flowGroups: [],
    actorProfiles: [],
    scenarioSpecs: [],
    flowSpecs: [],
    invariantSpecs: [],
    temporaryAcceptances: [],
    certificationTiers: [],
    finalReadinessCriteria: {
      requireAllTiersPass: true,
      requireNoAcceptedCriticalFlows: true,
      requireNoAcceptedCriticalScenarios: true,
      requireWorldStateConvergence: true,
    },
    securityRequirements: [],
    recoveryRequirements: [],
    slos: {},
    summary: {
      totalModules: 0,
      resolvedModules: 0,
      unresolvedModules: 0,
      scopeOnlyModuleCandidates: 0,
      humanRequiredModules: 0,
      totalFlowGroups: 0,
      resolvedFlowGroups: 0,
      unresolvedFlowGroups: 0,
      orphanManualModules: 0,
      orphanFlowSpecs: 0,
      excludedModules: 0,
      excludedFlowGroups: 0,
      groupedFlowGroups: 0,
      sharedCapabilityGroups: 0,
      opsInternalFlowGroups: 0,
      legacyNoiseFlowGroups: 0,
      legacyManualModules: 0,
    },
    diagnostics: {
      unresolvedModules: [],
      orphanManualModules: [],
      scopeOnlyModuleCandidates: [],
      humanRequiredModules: [],
      unresolvedFlowGroups: [],
      orphanFlowSpecs: [],
      excludedModules: [],
      excludedFlowGroups: [],
      legacyManualModules: [],
      groupedFlowGroups: [],
      sharedCapabilityGroups: [],
      opsInternalFlowGroups: [],
      legacyNoiseFlowGroups: [],
      blockerCount: 0,
      warningCount: 0,
    },
  };
}

function makeScenarioResult(
  scenarioId: string,
  overrides: Partial<PulseScenarioResult>,
): PulseScenarioResult {
  return {
    scenarioId,
    actorKind: 'customer',
    scenarioKind: 'single-session',
    critical: true,
    requested: true,
    runner: 'derived',
    status: 'passed',
    executed: true,
    truthMode: 'observed',
    summary: scenarioId,
    artifactPaths: [],
    specsExecuted: [],
    durationMs: 1,
    worldStateTouches: [],
    moduleKeys: [`module:${scenarioId}`],
    routePatterns: [`/${scenarioId}`],
    ...overrides,
  };
}

function makeActorEvidence(results: PulseScenarioResult[]): PulseActorEvidence {
  return {
    actorKind: 'customer',
    declared: results.map((result) => result.scenarioId),
    executed: results.filter((result) => result.executed).map((result) => result.scenarioId),
    missing: [],
    passed: results
      .filter((result) => result.status === 'passed')
      .map((result) => result.scenarioId),
    failed: results
      .filter((result) => result.status === 'failed')
      .map((result) => result.scenarioId),
    artifactPaths: [],
    summary: 'test actor evidence',
    results,
  };
}

describe('execution observation footprint', () => {
  it('does not count stale or not-run scenario evidence as observed', () => {
    const staleResult = makeScenarioResult('stale-checkout', {
      truthMode: 'inferred',
      routePatterns: ['/checkout/stale'],
      moduleKeys: ['checkout.stale'],
    });
    const notRunResult = makeScenarioResult('not-run-checkout', {
      status: 'skipped',
      executed: false,
      routePatterns: ['/checkout/not-run'],
      moduleKeys: ['checkout.not-run'],
    });
    const observedResult = makeScenarioResult('observed-checkout', {
      truthMode: 'observed-from-disk',
      routePatterns: ['/checkout/observed'],
      moduleKeys: ['checkout.observed'],
    });
    const evidence: Partial<PulseExecutionEvidence> = {
      customer: makeActorEvidence([staleResult, notRunResult, observedResult]),
    };

    const footprint = buildObservationFootprint(makeManifest(), evidence);

    expect(footprint.scenarioIds).toEqual(['observed-checkout']);
    expect(footprint.routePatterns).toEqual(['/checkout/observed']);
    expect(footprint.moduleKeys).toEqual(['checkout.observed']);
  });
});
