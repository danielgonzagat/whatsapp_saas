import { spawnSync } from 'child_process';
import * as path from 'path';

interface ProfilesFixtureResult {
  readonly coreCritical: {
    readonly flowIds: readonly string[];
    readonly invariantIds: readonly string[];
    readonly scenarioIds: readonly string[];
    readonly runtimeProbeIds: readonly string[];
    readonly requestedModes: readonly string[];
  };
  readonly fullProduct: {
    readonly flowIds: readonly string[];
    readonly scenarioIds: readonly string[];
    readonly runtimeProbeIds: readonly string[];
    readonly requestedModes: readonly string[];
  };
  readonly pulseCoreFinal: {
    readonly profile: string;
    readonly certificationTarget: {
      readonly final: boolean;
      readonly profile: string | null;
      readonly certificationScope: string | null;
    };
    readonly scenarioIds: readonly string[];
    readonly requestedModes: readonly string[];
  };
  readonly productionFinalAlias: string;
}

function runProfilesFixture(): ProfilesFixtureResult {
  const repoRoot = path.resolve(__dirname, '../../..');
  const script = String.raw`
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = process.cwd();
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (
    request === './external-signals/snapshot-config' &&
    parent &&
    parent.filename.includes(path.join('scripts', 'pulse'))
  ) {
    return { PULSE_EXTERNAL_INPUT_FILES: ['PULSE_CODACY_STATE.json'] };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { getProfileSelection, parseCertificationProfile } = require(path.join(
  repoRoot,
  'scripts/pulse/profiles.ts',
));

function createManifest() {
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

const manifest = createManifest();
const coreCritical = getProfileSelection('core-critical', manifest);
const fullProduct = getProfileSelection('full-product', manifest);
const pulseCoreFinal = getProfileSelection('pulse-core-final', manifest);

process.stdout.write(
  JSON.stringify({
    coreCritical: {
      flowIds: coreCritical.flowIds,
      invariantIds: coreCritical.invariantIds,
      scenarioIds: coreCritical.scenarioIds,
      runtimeProbeIds: coreCritical.runtimeProbeIds,
      requestedModes: coreCritical.requestedModes,
    },
    fullProduct: {
      flowIds: fullProduct.flowIds,
      scenarioIds: fullProduct.scenarioIds,
      runtimeProbeIds: fullProduct.runtimeProbeIds,
      requestedModes: fullProduct.requestedModes,
    },
    pulseCoreFinal: {
      profile: pulseCoreFinal.profile,
      certificationTarget: pulseCoreFinal.certificationTarget,
      scenarioIds: pulseCoreFinal.scenarioIds,
      requestedModes: pulseCoreFinal.requestedModes,
    },
    productionFinalAlias: parseCertificationProfile('production-final'),
  }),
);
`;

  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`profiles fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as ProfilesFixtureResult;
}

describe('getProfileSelection', () => {
  const fixture = runProfilesFixture();

  it('derives core-critical selection from manifest critical structures', () => {
    expect(fixture.coreCritical.flowIds).toEqual(['checkout-charge']);
    expect(fixture.coreCritical.invariantIds).toEqual(['billing-idempotency']);
    expect(fixture.coreCritical.scenarioIds).toEqual(['customer-checkout']);
    expect(fixture.coreCritical.runtimeProbeIds).toEqual(['backend-health', 'db-connectivity']);
    expect(fixture.coreCritical.requestedModes).toEqual(['customer']);
  });

  it('derives full-product selection from all manifest structures', () => {
    expect(fixture.fullProduct.flowIds).toEqual(['checkout-charge', 'billing-sync']);
    expect(fixture.fullProduct.scenarioIds).toEqual(['customer-checkout', 'system-reconciliation']);
    expect(fixture.fullProduct.runtimeProbeIds).toEqual(['backend-health', 'db-connectivity']);
    expect(fixture.fullProduct.requestedModes).toEqual(expect.arrayContaining(['customer', 'soak']));
  });

  it('derives pulse-core-final as a final PULSE-only scope', () => {
    expect(fixture.pulseCoreFinal.profile).toBe('pulse-core-final');
    expect(fixture.pulseCoreFinal.certificationTarget).toMatchObject({
      final: true,
      profile: 'pulse-core-final',
      certificationScope: 'pulse-core-final',
    });
    expect(fixture.pulseCoreFinal.scenarioIds).toEqual([]);
    expect(fixture.pulseCoreFinal.requestedModes).toEqual([]);
  });

  it('keeps production-final as a legacy alias for full-product', () => {
    expect(fixture.productionFinalAlias).toBe('full-product');
  });
});
