import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  writeJson,
  writeText,
  createResolvedManifest,
  createCodebaseTruth,
  createCertification,
} from './structural-reconstruction.fixtures';
import { buildScopeState } from '../../../scripts/pulse/scope-state';
import { buildCodacyEvidence } from '../../../scripts/pulse/codacy-evidence';
import { CoreParserData } from '../../../scripts/pulse/functional-map-types';
import { PulseHealth } from '../../../scripts/pulse/types.health';
import { buildStructuralGraph } from '../../../scripts/pulse/structural-graph';
import { buildCapabilityState } from '../../../scripts/pulse/capability-model';
import { buildFlowProjection } from '../../../scripts/pulse/flow-projection';
import { buildParityGaps } from '../../../scripts/pulse/parity-gaps';
import { buildProductVision } from '../../../scripts/pulse/product-vision';

describe('structural reconstruction', () => {
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

  it('derives real and phantom structures from code shape instead of module names', () => {
    const scopeState = buildScopeState(tempDir);
    const codacyEvidence = buildCodacyEvidence(scopeState);
    const coreData: CoreParserData = {
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
      prismaModels: [
        {
          name: 'Widget',
          accessorName: 'widget',
          line: 1,
          fields: [],
          relations: [],
        },
      ],
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
      hookRegistry: {} as CoreParserData['hookRegistry'],
    };

    const resolvedManifest = createResolvedManifest();
    const structuralGraph = buildStructuralGraph({
      rootDir: tempDir,
      coreData,
      scopeState,
      resolvedManifest,
    });
    const capabilityState = buildCapabilityState({
      structuralGraph,
      scopeState,
      codacyEvidence,
      resolvedManifest,
    });
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
    } satisfies PulseHealth;
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

    expect(structuralGraph.summary.roleCounts.interface).toBeGreaterThan(0);
    expect(structuralGraph.summary.roleCounts.persistence).toBe(1);
    expect(capabilityState.summary.realCapabilities).toBeGreaterThanOrEqual(1);
    expect(capabilityState.capabilities.some((capability) => /widget/i.test(capability.name))).toBe(
      true,
    );
    expect(
      capabilityState.capabilities.some((capability) => /^[^a-zA-Z0-9]+$/.test(capability.name)),
    ).toBe(false);
    expect(
      capabilityState.capabilities.some(
        (capability) =>
          capability.rolesPresent.includes('simulation') && capability.status !== 'real',
      ),
    ).toBe(true);
    expect(flowProjection.summary.totalFlows).toBe(1);
    expect(parityGaps.summary.totalGaps).toBeGreaterThan(0);
    expect(
      parityGaps.gaps.some(
        (gap) => gap.kind === 'ui_without_persistence' || gap.kind === 'front_without_back',
      ),
    ).toBe(true);
    expect(productVision.distanceSummary).toMatch(/phantom|latent|partial/i);
    expect(productVision.distanceSummary).toMatch(/structural parity gap/i);
  });

  it('does not collapse distinct capabilities that only share persistence', () => {
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

    expect(widgetCapability).toBeDefined();
    expect(profileCapability).toBeDefined();
    expect(widgetCapability?.id).not.toBe(profileCapability?.id);
    expect(widgetCapability?.routePatterns).not.toContain('/api/profiles');
    expect(profileCapability?.routePatterns).not.toContain('/api/widgets');
  });
});
