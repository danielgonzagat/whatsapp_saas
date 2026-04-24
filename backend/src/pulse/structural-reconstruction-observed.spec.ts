import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  writeJson,
  writeText,
  createResolvedManifest,
  createCodebaseTruth,
} from './structural-reconstruction.fixtures';

describe('structural reconstruction observed chains', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-structural-'));

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
    writeText(
      path.join(tempDir, 'backend/src/widgets/widget.controller.ts'),
      'export class WidgetController {}\n',
    );
    writeText(
      path.join(tempDir, 'backend/src/widgets/widget.service.ts'),
      'export async function saveWidget() { await fetch("https://example.com"); }\n',
    );
    writeText(
      path.join(tempDir, 'backend/prisma/schema.prisma'),
      'model Widget { id String @id }\n',
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('marks only the executed structural chain as observed', () => {
    writeText(
      path.join(tempDir, 'frontend/src/app/widgets/page.tsx'),
      'export default function WidgetsPage() { return <button>Save widget</button>; }\n',
    );
    writeText(
      path.join(tempDir, 'frontend/src/app/profiles/page.tsx'),
      'export default function ProfilesPage() { return <button>Save profile</button>; }\n',
    );
    writeText(
      path.join(tempDir, 'backend/src/shared/shared.controller.ts'),
      'export class SharedController {}\n',
    );
    writeText(
      path.join(tempDir, 'backend/src/shared/shared.service.ts'),
      'export class SharedService {}\n',
    );
    writeText(
      path.join(tempDir, 'backend/prisma/schema.prisma'),
      'model Workspace { id String @id }\n',
    );

    const scopeState = buildScopeState(tempDir);
    const codacyEvidence = buildCodacyEvidence(scopeState);
    const resolvedManifest = createResolvedManifest();
    const coreData: CoreParserData = {
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
      prismaModels: [
        {
          name: 'Workspace',
          accessorName: 'workspace',
          line: 1,
          fields: [],
          relations: [],
        },
      ],
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
      hookRegistry: {} as CoreParserData['hookRegistry'],
    };
    const executionEvidence = {
      flows: {
        results: [],
      },
      runtime: {
        probes: [],
      },
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
      operator: {
        results: [],
      },
      admin: {
        results: [],
      },
      soak: {
        results: [],
      },
    } as Partial<PulseExecutionEvidence>;

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

    expect(
      structuralGraph.nodes.find(
        (node) => node.kind === 'backend_route' && node.label === 'POST /api/widgets',
      )?.truthMode,
    ).toBe('observed');
    expect(
      structuralGraph.nodes.find(
        (node) => node.kind === 'backend_route' && node.label === 'POST /api/profiles',
      )?.truthMode,
    ).toBe('inferred');

    expect(
      capabilityState.capabilities.find((capability) =>
        capability.routePatterns.includes('/api/widgets'),
      )?.truthMode,
    ).toBe('observed');
    expect(
      capabilityState.capabilities.find((capability) =>
        capability.routePatterns.includes('/api/profiles'),
      )?.truthMode,
    ).toBe('inferred');

    expect(flowProjection.flows.find((flow) => flow.id === 'widget-save-flow')?.truthMode).toBe(
      'observed',
    );
    expect(flowProjection.flows.find((flow) => flow.id === 'profile-save-flow')?.truthMode).toBe(
      'inferred',
    );
  });
});
