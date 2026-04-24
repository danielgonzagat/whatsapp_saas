import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CoreParserData } from '../../../scripts/pulse/functional-map-types';
import { buildScopeState } from '../../../scripts/pulse/scope-state';
import { buildCodacyEvidence } from '../../../scripts/pulse/codacy-evidence';
import { buildStructuralGraph } from '../../../scripts/pulse/structural-graph';
import { buildCapabilityState } from '../../../scripts/pulse/capability-model';
import { buildFlowProjection } from '../../../scripts/pulse/flow-projection';
import { buildParityGaps } from '../../../scripts/pulse/parity-gaps';
import { buildProductVision } from '../../../scripts/pulse/product-vision';
import type {
  PulseCertification,
  PulseCodebaseTruth,
  PulseExecutionEvidence,
  PulseHealth,
  PulseResolvedManifest,
} from '../../../scripts/pulse/types';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function createResolvedManifest(): PulseResolvedManifest {
  return {
    generatedAt: new Date().toISOString(),
    sourceManifestPath: null,
    projectId: 'pulse-test',
    projectName: 'Pulse Test',
    systemType: 'monorepo',
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

function createCodebaseTruth(): PulseCodebaseTruth {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: 2,
      userFacingPages: 2,
      discoveredModules: 0,
      discoveredFlows: 1,
      blockerCount: 0,
      warningCount: 0,
    },
    pages: [],
    discoveredModules: [],
    discoveredFlows: [
      {
        id: 'widget-save-flow',
        moduleKey: 'derived',
        moduleName: 'Derived',
        pageRoute: '/widgets',
        elementLabel: 'Salvar',
        httpMethod: 'POST',
        endpoint: '/api/widgets',
        backendRoute: '/api/widgets',
        connected: true,
        persistent: true,
        declaredFlow: 'widget-save-flow',
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

function createCertification(): PulseCertification {
  return {
    version: 'test',
    status: 'PARTIAL',
    humanReplacementStatus: 'NOT_READY',
    rawScore: 70,
    score: 68,
    commitSha: 'test',
    environment: 'scan',
    timestamp: new Date().toISOString(),
    manifestPath: null,
    unknownSurfaces: [],
    unavailableChecks: [],
    unsupportedStacks: [],
    criticalFailures: [],
    gates: {} as PulseCertification['gates'],
    truthSummary: {
      totalPages: 2,
      userFacingPages: 2,
      discoveredModules: 0,
      discoveredFlows: 1,
      blockerCount: 0,
      warningCount: 0,
    },
    truthDivergence: {
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
    scopeStateSummary: null,
    codacySummary: null,
    codacyEvidenceSummary: null,
    resolvedManifestSummary: createResolvedManifest().summary,
    structuralGraphSummary: null,
    capabilityStateSummary: null,
    flowProjectionSummary: null,
    unresolvedModules: [],
    unresolvedFlows: [],
    certificationTarget: { tier: null, final: false, profile: null },
    tierStatus: [],
    blockingTier: 2,
    acceptedFlowsRemaining: [],
    pendingCriticalScenarios: [],
    finalReadinessCriteria: null,
    evidenceSummary: {
      runtime: {
        executed: false,
        executedChecks: [],
        blockingBreakTypes: [],
        artifactPaths: [],
        summary: '',
        probes: [],
      },
      browser: {
        attempted: false,
        executed: false,
        artifactPaths: [],
        summary: '',
      },
      flows: {
        declared: ['widget-save-flow'],
        executed: [],
        missing: [],
        passed: [],
        failed: [],
        accepted: [],
        artifactPaths: [],
        summary: '',
        results: [],
      },
      invariants: {
        declared: [],
        evaluated: [],
        missing: [],
        passed: [],
        failed: [],
        accepted: [],
        artifactPaths: [],
        summary: '',
        results: [],
      },
      observability: {
        executed: false,
        artifactPaths: [],
        summary: '',
        signals: {
          tracingHeadersDetected: false,
          requestIdMiddlewareDetected: false,
          structuredLoggingDetected: false,
          sentryDetected: false,
          alertingIntegrationDetected: false,
          healthEndpointsDetected: false,
          auditTrailDetected: false,
        },
      },
      recovery: {
        executed: false,
        artifactPaths: [],
        summary: '',
        signals: {
          backupManifestPresent: false,
          backupPolicyPresent: false,
          backupValidationPresent: false,
          restoreRunbookPresent: false,
          disasterRecoveryRunbookPresent: false,
          disasterRecoveryTestPresent: false,
          seedScriptPresent: false,
        },
      },
      customer: {
        actorKind: 'customer',
        declared: [],
        executed: [],
        missing: [],
        passed: [],
        failed: [],
        artifactPaths: [],
        summary: '',
        results: [],
      },
      operator: {
        actorKind: 'operator',
        declared: [],
        executed: [],
        missing: [],
        passed: [],
        failed: [],
        artifactPaths: [],
        summary: '',
        results: [],
      },
      admin: {
        actorKind: 'admin',
        declared: [],
        executed: [],
        missing: [],
        passed: [],
        failed: [],
        artifactPaths: [],
        summary: '',
        results: [],
      },
      soak: {
        actorKind: 'soak',
        declared: [],
        executed: [],
        missing: [],
        passed: [],
        failed: [],
        artifactPaths: [],
        summary: '',
        results: [],
      },
      syntheticCoverage: {
        executed: false,
        artifactPaths: [],
        summary: '',
        totalPages: 0,
        userFacingPages: 0,
        coveredPages: 0,
        uncoveredPages: [],
        results: [],
      },
      worldState: {
        generatedAt: new Date().toISOString(),
        actorProfiles: [],
        executedScenarios: [],
        pendingAsyncExpectations: [],
        entities: {},
        asyncExpectationsStatus: [],
        artifactsByScenario: {},
        sessions: [],
      },
      executionTrace: {
        runId: 'test',
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        phases: [],
        summary: '',
        artifactPaths: [],
      },
    },
    gateEvidence: {},
    dynamicBlockingReasons: [],
  };
}

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
