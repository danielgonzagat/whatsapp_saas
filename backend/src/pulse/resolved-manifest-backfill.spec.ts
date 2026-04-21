import { buildResolvedManifest } from '../../../scripts/pulse/resolved-manifest';
import type { PulseCodebaseTruth, PulseManifest } from '../../../scripts/pulse/types';

function createManifest(): PulseManifest {
  return {
    version: 1,
    projectId: 'kloel',
    projectName: 'KLOEL',
    systemType: 'monorepo',
    supportedStacks: [],
    surfaces: [],
    criticalDomains: [],
    modules: [{ name: 'Auth', state: 'READY', notes: '', critical: true }],
    actorProfiles: [],
    scenarioSpecs: [
      {
        id: 'customer-auth-shell',
        actorKind: 'customer',
        scenarioKind: 'single-session',
        critical: true,
        moduleKeys: ['auth'],
        routePatterns: ['/dashboard'],
        flowSpecs: ['auth-login'],
        flowGroups: ['shared-auth-oauth'],
        playwrightSpecs: ['specs/critical-flow.spec.ts'],
        runtimeProbes: ['auth-session'],
        requiresBrowser: true,
        requiresPersistence: true,
        asyncExpectations: [],
        providerMode: 'hybrid',
        timeWindowModes: ['total'],
        runner: 'playwright-spec',
        executionMode: 'real',
        worldStateKeys: ['auth.session'],
        requiredArtifacts: ['PULSE_RUNTIME_EVIDENCE.json'],
        notes: '',
      },
    ],
    externalIntegrations: [],
    jobs: [],
    webhooks: [],
    stateMachines: [],
    criticalFlows: ['auth-login'],
    invariants: [],
    flowSpecs: [
      {
        id: 'auth-login',
        surface: 'auth',
        runner: 'runtime-e2e',
        oracle: 'auth-session',
        providerMode: 'hybrid',
        smokeRequired: false,
        critical: true,
        preconditions: [],
        environments: ['deep', 'total'],
        notes: '',
      },
    ],
    invariantSpecs: [],
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

function createCodebaseTruth(): PulseCodebaseTruth {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: 1,
      userFacingPages: 1,
      discoveredModules: 1,
      discoveredFlows: 1,
      blockerCount: 0,
      warningCount: 0,
    },
    pages: [
      {
        route: '/dashboard',
        group: 'main',
        moduleKey: 'auth',
        moduleName: 'Auth',
        shellComplexity: 'rich',
        totalInteractions: 1,
        functioningInteractions: 1,
        facadeInteractions: 0,
        brokenInteractions: 0,
        incompleteInteractions: 0,
        absentInteractions: 0,
        apiBoundInteractions: 1,
        backendBoundInteractions: 1,
        persistedInteractions: 1,
        totalDataSources: 1,
        backedDataSources: 1,
      },
    ],
    discoveredModules: [
      {
        key: 'auth',
        name: 'Auth',
        routeRoots: ['/dashboard'],
        groups: ['main'],
        userFacing: true,
        shellComplexity: 'rich',
        pageCount: 1,
        totalInteractions: 1,
        functioningInteractions: 1,
        facadeInteractions: 0,
        brokenInteractions: 0,
        incompleteInteractions: 0,
        absentInteractions: 0,
        apiBoundInteractions: 1,
        backendBoundInteractions: 1,
        persistedInteractions: 1,
        totalDataSources: 1,
        backedDataSources: 1,
        state: 'READY',
        declaredModule: 'Auth',
        notes: '',
      },
    ],
    discoveredFlows: [
      {
        id: 'auth-shell-fallback',
        moduleKey: 'auth',
        moduleName: 'Auth',
        pageRoute: '/dashboard',
        elementLabel: 'Entrar',
        httpMethod: 'POST',
        endpoint: '/api/auth/login',
        backendRoute: '/auth/login',
        connected: true,
        persistent: true,
        declaredFlow: 'auth-login',
      },
    ],
    divergence: {
      declaredNotDiscovered: [],
      discoveredNotDeclared: [],
      declaredButInternal: [],
      frontendSurfaceWithoutBackendSupport: [],
      backendCapabilityWithoutFrontendSurface: [],
      shellWithoutPersistence: [],
      flowCandidatesWithoutOracle: [],
      blockerCount: 0,
      warningCount: 0,
    },
  };
}

describe('buildResolvedManifest flow-group backfill', () => {
  it('synthesizes shared-auth-oauth when a scenario declares it and auth routes exist', () => {
    const resolved = buildResolvedManifest(
      createManifest(),
      '/tmp/pulse.manifest.json',
      createCodebaseTruth(),
    );
    const oauthGroup = resolved.flowGroups.find((group) => group.id === 'shared-auth-oauth');

    expect(oauthGroup).toBeDefined();
    expect(oauthGroup?.matchedFlowSpec).toBe('auth-login');
    expect(oauthGroup?.moduleKeys).toContain('auth');
    expect(oauthGroup?.pageRoutes).toContain('/dashboard');
  });
});
