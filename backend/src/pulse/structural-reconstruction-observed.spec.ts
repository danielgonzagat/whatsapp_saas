import { spawnSync } from 'child_process';
import * as path from 'path';

interface StructuralObservedFixtureResult {
  readonly widgetBackendRouteTruthMode: string | null;
  readonly profileBackendRouteTruthMode: string | null;
  readonly widgetCapabilityTruthMode: string | null;
  readonly profileCapabilityTruthMode: string | null;
  readonly widgetFlowTruthMode: string | null;
  readonly profileFlowTruthMode: string | null;
}

function runStructuralObservedFixture(): StructuralObservedFixtureResult {
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
} = require(path.join(repoRoot, 'backend/test/pulse/structural-reconstruction.fixtures.ts'));
const { buildScopeState } = require(path.join(repoRoot, 'scripts/pulse/scope-state.ts'));
const { buildCodacyEvidence } = require(path.join(repoRoot, 'scripts/pulse/codacy-evidence.ts'));
const { buildStructuralGraph } = require(path.join(repoRoot, 'scripts/pulse/structural-graph.ts'));
const { buildCapabilityState } = require(path.join(repoRoot, 'scripts/pulse/capability-model.ts'));
const { buildFlowProjection } = require(path.join(repoRoot, 'scripts/pulse/flow-projection.ts'));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-structural-'));
try {
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
    'export default function WidgetsPage() { return <button>Save widget</button>; }\n',
  );
  writeText(
    path.join(tempDir, 'frontend/src/app/profiles/page.tsx'),
    'export default function ProfilesPage() { return <button>Save profile</button>; }\n',
  );
  writeText(
    path.join(tempDir, 'frontend/src/app/fake/page.tsx'),
    'export default function Page() { return <button>Fake</button>; }\n',
  );
  writeText(
    path.join(tempDir, 'backend/src/shared/shared.controller.ts'),
    'export class SharedController {}\n',
  );
  writeText(
    path.join(tempDir, 'backend/src/shared/shared.service.ts'),
    'export class SharedService {}\n',
  );
  writeText(path.join(tempDir, 'backend/prisma/schema.prisma'), 'model Workspace { id String @id }\n');

  const scopeState = buildScopeState(tempDir);
  const codacyEvidence = buildCodacyEvidence(scopeState);
  const resolvedManifest = createResolvedManifest();
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
  const executionEvidence = {
    flows: { results: [] },
    runtime: { probes: [] },
    customer: {
      results: [
        {
          scenarioId: 'customer-widgets',
          actorKind: 'customer',
          scenarioKind: 'single-session',
          critical: true,
          requested: true,
          runner: 'derived',
          status: 'passed',
          executed: true,
          summary: 'Widget scenario executed.',
          artifactPaths: [],
          specsExecuted: [],
          durationMs: 12,
          worldStateTouches: [],
          moduleKeys: ['widgets'],
          routePatterns: ['/widgets', '/api/widgets'],
        },
      ],
    },
    operator: { results: [] },
    admin: { results: [] },
    soak: { results: [] },
  };

  const structuralGraph = buildStructuralGraph({
    rootDir: tempDir,
    coreData,
    scopeState,
    resolvedManifest,
    executionEvidence,
  });
  const capabilityState = buildCapabilityState({
    structuralGraph,
    scopeState,
    codacyEvidence,
    resolvedManifest,
    executionEvidence,
  });
  const flowProjection = buildFlowProjection({
    structuralGraph,
    capabilityState,
    codebaseTruth: {
      ...createCodebaseTruth(),
      discoveredFlows: [
        {
          id: 'widget-save-flow',
          moduleKey: 'widgets',
          moduleName: 'Widgets',
          pageRoute: '/widgets',
          elementLabel: 'Save widget',
          httpMethod: 'POST',
          endpoint: '/api/widgets',
          backendRoute: '/api/widgets',
          connected: true,
          persistent: true,
          declaredFlow: 'widget-save-flow',
        },
        {
          id: 'profile-save-flow',
          moduleKey: 'profiles',
          moduleName: 'Profiles',
          pageRoute: '/profiles',
          elementLabel: 'Save profile',
          httpMethod: 'POST',
          endpoint: '/api/profiles',
          backendRoute: '/api/profiles',
          connected: true,
          persistent: true,
          declaredFlow: 'profile-save-flow',
        },
      ],
    },
    resolvedManifest,
    executionEvidence,
  });

  process.stdout.write(
    JSON.stringify({
      widgetBackendRouteTruthMode:
        structuralGraph.nodes.find(
          (node) => node.kind === 'backend_route' && node.label === 'POST /api/widgets',
        )?.truthMode ?? null,
      profileBackendRouteTruthMode:
        structuralGraph.nodes.find(
          (node) => node.kind === 'backend_route' && node.label === 'POST /api/profiles',
        )?.truthMode ?? null,
      widgetCapabilityTruthMode:
        capabilityState.capabilities.find((capability) => capability.routePatterns.includes('/api/widgets'))
          ?.truthMode ?? null,
      profileCapabilityTruthMode:
        capabilityState.capabilities.find((capability) => capability.routePatterns.includes('/api/profiles'))
          ?.truthMode ?? null,
      widgetFlowTruthMode: flowProjection.flows.find((flow) => flow.id === 'widget-save-flow')?.truthMode ?? null,
      profileFlowTruthMode: flowProjection.flows.find((flow) => flow.id === 'profile-save-flow')?.truthMode ?? null,
    }),
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
`;

  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`structural observed fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as StructuralObservedFixtureResult;
}

describe('structural reconstruction observed chains', () => {
  it('marks only the executed structural chain as observed', () => {
    const result = runStructuralObservedFixture();

    expect(result.widgetBackendRouteTruthMode).toBe('observed');
    expect(result.profileBackendRouteTruthMode).toBe('inferred');
    expect(result.widgetCapabilityTruthMode).toBe('observed');
    expect(result.profileCapabilityTruthMode).toBe('inferred');
    expect(result.widgetFlowTruthMode).toBe('observed');
    expect(result.profileFlowTruthMode).toBe('inferred');
  });
});
