import { spawnSync } from 'child_process';
import * as path from 'path';

interface StructuralReconstructionFixtureResult {
  readonly roleCountsInterface: number;
  readonly roleCountsPersistence: number;
  readonly realPlusPartialCapabilities: number;
  readonly hasWidgetCapability: boolean;
  readonly hasSymbolOnlyCapabilityName: boolean;
  readonly hasNonRealSimulationCapability: boolean;
  readonly totalFlows: number;
  readonly totalParityGaps: number;
  readonly distanceSummary: string;
  readonly distinctWidgetProfile: {
    readonly widgetDefined: boolean;
    readonly profileDefined: boolean;
    readonly differentIds: boolean;
    readonly widgetContainsProfileRoute: boolean;
    readonly profileContainsWidgetRoute: boolean;
  };
}

function runStructuralReconstructionFixture(): StructuralReconstructionFixtureResult {
  const repoRoot = path.resolve(__dirname, '../../..');
  const script = String.raw`
const fs = require('fs');
const os = require('os');
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

const {
  writeJson,
  writeText,
  createResolvedManifest,
  createCodebaseTruth,
  createCertification,
} = require(path.join(repoRoot, 'backend/test/pulse/structural-reconstruction.fixtures.ts'));
const { buildScopeState } = require(path.join(repoRoot, 'scripts/pulse/scope-state.ts'));
const { buildCodacyEvidence } = require(path.join(repoRoot, 'scripts/pulse/codacy-evidence.ts'));
const { buildStructuralGraph } = require(path.join(repoRoot, 'scripts/pulse/structural-graph.ts'));
const { buildCapabilityState } = require(path.join(repoRoot, 'scripts/pulse/capability-model.ts'));
const { buildFlowProjection } = require(path.join(repoRoot, 'scripts/pulse/flow-projection.ts'));
const { buildParityGaps } = require(path.join(repoRoot, 'scripts/pulse/parity-gaps.ts'));
const { buildProductVision } = require(path.join(repoRoot, 'scripts/pulse/product-vision.ts'));

function setupTempDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-structural-'));
  writeJson(path.join(tempDir, 'ops/protected-governance-files.json'), {
    protectedExact: [],
    protectedPrefixes: ['scripts/ops/'],
  });
  writeJson(path.join(tempDir, 'PULSE_CODACY_STATE.json'), {
    syncedAt: new Date().toISOString(),
    totalIssues: 1,
    bySeverity: { HIGH: 1, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
    byTool: { Opengrep: 1 },
    repositorySummary: { loc: 10 },
    topFiles: [{ file: 'frontend/src/app/fake/page.tsx', count: 1 }],
    highPriorityBatch: [
      {
        issueId: 'hotspot-1',
        filePath: 'frontend/src/app/fake/page.tsx',
        lineNumber: 1,
        patternId: 'fake.rule',
        category: 'Quality',
        severityLevel: 'HIGH',
        tool: 'Opengrep',
        message: 'Fake path',
        commitSha: null,
        commitTimestamp: null,
      },
    ],
  });
  writeText(
    path.join(tempDir, 'frontend/src/app/widgets/page.tsx'),
    'export default function Page() { return <button>Salvar</button>; }\n',
  );
  writeText(
    path.join(tempDir, 'frontend/src/app/fake/page.tsx'),
    'export default function Page() { return <button>Fake</button>; }\n',
  );
  writeText(path.join(tempDir, 'backend/src/widgets/widget.controller.ts'), 'export class WidgetController {}\n');
  writeText(
    path.join(tempDir, 'backend/src/widgets/widget.service.ts'),
    'export async function saveWidget() { await fetch("https://example.com"); }\n',
  );
  writeText(path.join(tempDir, 'backend/prisma/schema.prisma'), 'model Widget { id String @id }\n');
  return tempDir;
}

function runShapeScenario() {
  const tempDir = setupTempDir();
  try {
    const scopeState = buildScopeState(tempDir);
    const codacyEvidence = buildCodacyEvidence(scopeState);
    const coreData = {
      uiElements: [
        {
          file: 'frontend/src/app/widgets/page.tsx',
          line: 1,
          type: 'button',
          label: 'Salvar',
          handler: 'handleSave',
          handlerType: 'real',
          apiCalls: ['/api/widgets'],
          component: 'WidgetsPage',
        },
        {
          file: 'frontend/src/app/fake/page.tsx',
          line: 1,
          type: 'button',
          label: 'Fake',
          handler: 'handleFake',
          handlerType: 'real',
          apiCalls: [],
          component: 'FakePage',
        },
      ],
      apiCalls: [
        {
          file: 'frontend/src/app/widgets/page.tsx',
          line: 1,
          endpoint: '/api/widgets',
          normalizedPath: '/api/widgets',
          method: 'post',
          callPattern: 'fetch',
          isProxy: false,
          proxyTarget: null,
          callerFunction: 'handleSave',
        },
      ],
      backendRoutes: [
        {
          file: 'backend/src/widgets/widget.controller.ts',
          line: 1,
          controllerPath: '/api/widgets',
          methodPath: '',
          fullPath: '/api/widgets',
          httpMethod: 'POST',
          methodName: 'save',
          guards: [],
          isPublic: false,
          serviceCalls: ['WidgetService.save'],
        },
      ],
      prismaModels: [{ name: 'Widget', accessorName: 'widget', line: 1, fields: [], relations: [] }],
      serviceTraces: [
        {
          file: 'backend/src/widgets/widget.service.ts',
          serviceName: 'WidgetService',
          methodName: 'save',
          line: 1,
          prismaModels: ['Widget'],
        },
      ],
      proxyRoutes: [],
      facades: [
        {
          file: 'frontend/src/app/fake/page.tsx',
          line: 1,
          type: 'noop_handler',
          description: 'Fake button',
          severity: 'high',
          evidence: 'no persistence',
        },
      ],
      hookRegistry: {},
    };

    const resolvedManifest = createResolvedManifest();
    const structuralGraph = buildStructuralGraph({ rootDir: tempDir, coreData, scopeState, resolvedManifest });
    const capabilityState = buildCapabilityState({ structuralGraph, scopeState, codacyEvidence, resolvedManifest });
    const flowProjection = buildFlowProjection({
      structuralGraph,
      capabilityState,
      codebaseTruth: createCodebaseTruth(),
      resolvedManifest,
    });
    const health = {
      score: 0,
      totalNodes: 0,
      breaks: [],
      stats: {
        uiElements: 0,
        uiDeadHandlers: 0,
        apiCalls: 0,
        apiNoRoute: 0,
        backendRoutes: 0,
        backendEmpty: 0,
        prismaModels: 0,
        modelOrphans: 0,
        facades: 0,
        facadesBySeverity: { high: 0, medium: 0, low: 0 },
        proxyRoutes: 0,
        proxyNoUpstream: 0,
        securityIssues: 0,
        dataSafetyIssues: 0,
        qualityIssues: 0,
        unavailableChecks: 0,
        unknownSurfaces: 0,
      },
      timestamp: new Date().toISOString(),
    };
    const parityGaps = buildParityGaps({
      codebaseTruth: createCodebaseTruth(),
      capabilityState,
      flowProjection,
      certification: createCertification(),
      resolvedManifest,
      health,
    });
    const productVision = buildProductVision({
      capabilityState,
      flowProjection,
      certification: createCertification(),
      scopeState,
      codacyEvidence,
      resolvedManifest,
      parityGaps,
    });

    return {
      roleCountsInterface: structuralGraph.summary.roleCounts.interface,
      roleCountsPersistence: structuralGraph.summary.roleCounts.persistence,
      realPlusPartialCapabilities:
        capabilityState.summary.realCapabilities + capabilityState.summary.partialCapabilities,
      hasWidgetCapability: capabilityState.capabilities.some((capability) => /widget/i.test(capability.name)),
      hasSymbolOnlyCapabilityName: capabilityState.capabilities.some((capability) => /^[^a-zA-Z0-9]+$/.test(capability.name)),
      hasNonRealSimulationCapability: capabilityState.capabilities.some(
        (capability) => capability.rolesPresent.includes('simulation') && capability.status !== 'real',
      ),
      totalFlows: flowProjection.summary.totalFlows,
      totalParityGaps: parityGaps.summary.totalGaps,
      distanceSummary: productVision.distanceSummary,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runDistinctPersistenceScenario() {
  const tempDir = setupTempDir();
  try {
    writeText(
      path.join(tempDir, 'frontend/src/app/widgets/page.tsx'),
      'export default function WidgetsPage() { return <button>Save widget</button>; }\n',
    );
    writeText(
      path.join(tempDir, 'frontend/src/app/profiles/page.tsx'),
      'export default function ProfilesPage() { return <button>Save profile</button>; }\n',
    );
    writeText(path.join(tempDir, 'backend/src/shared/shared.controller.ts'), 'export class SharedController {}\n');
    writeText(path.join(tempDir, 'backend/src/shared/shared.service.ts'), 'export class SharedService {}\n');
    writeText(path.join(tempDir, 'backend/prisma/schema.prisma'), 'model Workspace { id String @id }\n');

    const scopeState = buildScopeState(tempDir);
    const codacyEvidence = buildCodacyEvidence(scopeState);
    const coreData = {
      uiElements: [
        {
          file: 'frontend/src/app/widgets/page.tsx',
          line: 1,
          type: 'button',
          label: 'Save widget',
          handler: 'handleWidgetSave',
          handlerType: 'real',
          apiCalls: ['/api/widgets'],
          component: 'WidgetsPage',
        },
        {
          file: 'frontend/src/app/profiles/page.tsx',
          line: 1,
          type: 'button',
          label: 'Save profile',
          handler: 'handleProfileSave',
          handlerType: 'real',
          apiCalls: ['/api/profiles'],
          component: 'ProfilesPage',
        },
      ],
      apiCalls: [
        {
          file: 'frontend/src/app/widgets/page.tsx',
          line: 1,
          endpoint: '/api/widgets',
          normalizedPath: '/api/widgets',
          method: 'post',
          callPattern: 'fetch',
          isProxy: false,
          proxyTarget: null,
          callerFunction: 'handleWidgetSave',
        },
        {
          file: 'frontend/src/app/profiles/page.tsx',
          line: 1,
          endpoint: '/api/profiles',
          normalizedPath: '/api/profiles',
          method: 'post',
          callPattern: 'fetch',
          isProxy: false,
          proxyTarget: null,
          callerFunction: 'handleProfileSave',
        },
      ],
      backendRoutes: [
        {
          file: 'backend/src/shared/shared.controller.ts',
          line: 1,
          controllerPath: '/api/widgets',
          methodPath: '',
          fullPath: '/api/widgets',
          httpMethod: 'POST',
          methodName: 'saveWidget',
          guards: [],
          isPublic: false,
          serviceCalls: ['SharedService.saveWidget'],
        },
        {
          file: 'backend/src/shared/shared.controller.ts',
          line: 20,
          controllerPath: '/api/profiles',
          methodPath: '',
          fullPath: '/api/profiles',
          httpMethod: 'POST',
          methodName: 'saveProfile',
          guards: [],
          isPublic: false,
          serviceCalls: ['SharedService.saveProfile'],
        },
      ],
      prismaModels: [{ name: 'Workspace', accessorName: 'workspace', line: 1, fields: [], relations: [] }],
      serviceTraces: [
        {
          file: 'backend/src/shared/shared.service.ts',
          serviceName: 'SharedService',
          methodName: 'saveWidget',
          line: 1,
          prismaModels: ['Workspace'],
        },
        {
          file: 'backend/src/shared/shared.service.ts',
          serviceName: 'SharedService',
          methodName: 'saveProfile',
          line: 20,
          prismaModels: ['Workspace'],
        },
      ],
      proxyRoutes: [],
      facades: [],
      hookRegistry: {},
    };

    const structuralGraph = buildStructuralGraph({
      rootDir: tempDir,
      coreData,
      scopeState,
      resolvedManifest: createResolvedManifest(),
    });
    const capabilityState = buildCapabilityState({
      structuralGraph,
      scopeState,
      codacyEvidence,
      resolvedManifest: createResolvedManifest(),
    });
    const widgetCapability = capabilityState.capabilities.find((capability) =>
      capability.routePatterns.includes('/api/widgets'),
    );
    const profileCapability = capabilityState.capabilities.find((capability) =>
      capability.routePatterns.includes('/api/profiles'),
    );

    return {
      widgetDefined: Boolean(widgetCapability),
      profileDefined: Boolean(profileCapability),
      differentIds: widgetCapability?.id !== profileCapability?.id,
      widgetContainsProfileRoute: widgetCapability?.routePatterns.includes('/api/profiles') ?? false,
      profileContainsWidgetRoute: profileCapability?.routePatterns.includes('/api/widgets') ?? false,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

process.stdout.write(
  JSON.stringify({
    ...runShapeScenario(),
    distinctWidgetProfile: runDistinctPersistenceScenario(),
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
    throw new Error(`structural reconstruction fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as StructuralReconstructionFixtureResult;
}

describe('structural reconstruction', () => {
  const fixture = runStructuralReconstructionFixture();

  it('derives real and phantom structures from code shape instead of module names', () => {
    expect(fixture.roleCountsInterface).toBeGreaterThan(0);
    expect(fixture.roleCountsPersistence).toBe(1);
    expect(fixture.realPlusPartialCapabilities).toBeGreaterThanOrEqual(1);
    expect(fixture.hasWidgetCapability).toBe(true);
    expect(fixture.hasSymbolOnlyCapabilityName).toBe(false);
    expect(fixture.hasNonRealSimulationCapability).toBe(true);
    expect(fixture.totalFlows).toBe(1);
    expect(fixture.totalParityGaps).toBeGreaterThan(0);
    expect(fixture.distanceSummary).toBeTruthy();
    expect(fixture.distanceSummary).toMatch(/structural parity gap/i);
  });

  it('does not collapse distinct capabilities that only share persistence', () => {
    expect(fixture.distinctWidgetProfile.widgetDefined).toBe(true);
    expect(fixture.distinctWidgetProfile.profileDefined).toBe(true);
    expect(fixture.distinctWidgetProfile.differentIds).toBe(true);
    expect(fixture.distinctWidgetProfile.widgetContainsProfileRoute).toBe(false);
    expect(fixture.distinctWidgetProfile.profileContainsWidgetRoute).toBe(false);
  });
});
