import { getProfileSelection, parseCertificationProfile } from '../../../scripts/pulse/profiles';
import type { PulseManifest } from '../../../scripts/pulse/types';

function createManifest(): PulseManifest {
  return {
    version: 1,
    projectId: 'test',
    projectName: 'Test',
    systemType: 'monorepo',
    supportedStacks: [],
    surfaces: [],
    criticalDomains: [],
    modules: [],
    actorProfiles: [],
    scenarioSpecs: [
      {
        id: 'customer-checkout',
        actorKind: 'customer',
        scenarioKind: 'single-session',
        critical: true,
        moduleKeys: ['checkout'],
        routePatterns: ['/checkout'],
        flowSpecs: ['checkout-charge'],
        flowGroups: [],
        playwrightSpecs: [],
        runtimeProbes: ['backend-health', 'db-connectivity'],
        requiresBrowser: true,
        requiresPersistence: true,
        asyncExpectations: [],
        providerMode: 'hybrid',
        timeWindowModes: ['total'],
        runner: 'derived',
        executionMode: 'derived',
        worldStateKeys: [],
        requiredArtifacts: [],
        notes: '',
      },
      {
        id: 'system-reconciliation',
        actorKind: 'system',
        scenarioKind: 'async-reconciled',
        critical: false,
        moduleKeys: ['billing'],
        routePatterns: ['/billing'],
        flowSpecs: ['billing-sync'],
        flowGroups: [],
        playwrightSpecs: [],
        runtimeProbes: ['backend-health'],
        requiresBrowser: false,
        requiresPersistence: true,
        asyncExpectations: ['billing-reconciled'],
        providerMode: 'replay',
        timeWindowModes: ['soak'],
        runner: 'derived',
        executionMode: 'derived',
        worldStateKeys: [],
        requiredArtifacts: [],
        notes: '',
      },
    ],
    externalIntegrations: [],
    jobs: [],
    webhooks: [],
    stateMachines: [],
    criticalFlows: ['checkout-charge'],
    invariants: [],
    flowSpecs: [
      {
        id: 'checkout-charge',
        surface: 'checkout',
        runner: 'hybrid',
        oracle: 'payment-lifecycle',
        providerMode: 'hybrid',
        smokeRequired: false,
        critical: true,
        preconditions: [],
        environments: ['total'],
        notes: '',
      },
      {
        id: 'billing-sync',
        surface: 'billing',
        runner: 'runtime-e2e',
        oracle: 'entity-persisted',
        providerMode: 'replay',
        smokeRequired: false,
        critical: false,
        preconditions: [],
        environments: ['total'],
        notes: '',
      },
    ],
    invariantSpecs: [
      {
        id: 'billing-idempotency',
        surface: 'billing',
        source: 'hybrid',
        evaluator: 'payment-idempotency',
        critical: true,
        dependsOn: [],
        environments: ['total'],
        notes: '',
      },
    ],
    temporaryAcceptances: [],
    certificationTiers: [],
    finalReadinessCriteria: {
      requireAllTiersPass: true,
      requireNoAcceptedCriticalFlows: true,
      requireNoAcceptedCriticalScenarios: true,
      requireWorldStateConvergence: true,
    },
    slos: {},
    securityRequirements: [],
    recoveryRequirements: [],
    excludedSurfaces: [],
    environments: ['scan', 'deep', 'total'],
  };
}

// PULSE_OK: assertions exist below
describe('getProfileSelection', () => {
  it('derives core-critical selection from manifest critical structures', () => {
    const selection = getProfileSelection('core-critical', createManifest());

    expect(selection.flowIds).toEqual(['checkout-charge']);
    expect(selection.invariantIds).toEqual(['billing-idempotency']);
    expect(selection.scenarioIds).toEqual(['customer-checkout']);
    expect(selection.runtimeProbeIds).toEqual(['backend-health', 'db-connectivity']);
    expect(selection.requestedModes).toEqual(['customer']);
  });

  it('derives full-product selection from all manifest structures', () => {
    const selection = getProfileSelection('full-product', createManifest());

    expect(selection.flowIds).toEqual(['checkout-charge', 'billing-sync']);
    expect(selection.scenarioIds).toEqual(['customer-checkout', 'system-reconciliation']);
    expect(selection.runtimeProbeIds).toEqual(['backend-health', 'db-connectivity']);
    expect(selection.requestedModes).toEqual(expect.arrayContaining(['customer', 'soak']));
  });

  it('derives pulse-core-final as a final PULSE-only scope', () => {
    const selection = getProfileSelection('pulse-core-final', createManifest());

    expect(selection.profile).toBe('pulse-core-final');
    expect(selection.certificationTarget).toMatchObject({
      final: true,
      profile: 'pulse-core-final',
      certificationScope: 'pulse-core-final',
    });
    expect(selection.scenarioIds).toEqual([]);
    expect(selection.requestedModes).toEqual([]);
  });

  it('keeps production-final as a legacy alias for full-product', () => {
    expect(parseCertificationProfile('production-final')).toBe('full-product');
  });
});
