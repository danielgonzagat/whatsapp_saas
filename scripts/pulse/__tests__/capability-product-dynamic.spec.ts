import { describe, expect, it } from 'vitest';

import { buildFlowProjection } from '../flow-projection';
import { buildProductModel } from '../product-model';
import type {
  PulseActorEvidence,
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseExecutionEvidence,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
  PulseStructuralNode,
} from '../types';

function structuralNode(overrides: Partial<PulseStructuralNode>): PulseStructuralNode {
  return {
    id: 'node:opaque',
    kind: 'backend_route',
    role: 'orchestration',
    truthMode: 'inferred',
    adapter: 'test',
    label: 'Opaque',
    file: 'backend/src/opaque/opaque.controller.ts',
    line: 1,
    userFacing: true,
    runtimeCritical: false,
    protectedByGovernance: false,
    metadata: {},
    ...overrides,
  };
}

function structuralGraph(nodes: PulseStructuralNode[]): PulseStructuralGraph {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalNodes: nodes.length,
      totalEdges: 2,
      roleCounts: {
        interface: nodes.filter((node) => node.role === 'interface').length,
        orchestration: nodes.filter((node) => node.role === 'orchestration').length,
        persistence: nodes.filter((node) => node.role === 'persistence').length,
        side_effect: nodes.filter((node) => node.role === 'side_effect').length,
        simulation: 0,
      },
      interfaceChains: 1,
      completeChains: 1,
      partialChains: 0,
      simulatedChains: 0,
    },
    nodes,
    edges: [
      {
        id: 'edge:ui-api',
        from: 'ui:opaque',
        to: 'api:opaque',
        kind: 'calls',
        truthMode: 'observed',
        evidence: 'test',
      },
      {
        id: 'edge:api-db',
        from: 'api:opaque',
        to: 'db:opaque',
        kind: 'persists',
        truthMode: 'observed',
        evidence: 'test',
      },
    ],
  };
}

function scopeState(): PulseScopeState {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    rootDir: '/tmp/pulse-dynamic',
    summary: {
      totalFiles: 3,
      totalLines: 90,
      runtimeCriticalFiles: 0,
      userFacingFiles: 1,
      humanRequiredFiles: 0,
      surfaceCounts: {
        frontend: 1,
        'frontend-admin': 0,
        backend: 2,
        worker: 0,
        prisma: 0,
        e2e: 0,
        scripts: 0,
        docs: 0,
        infra: 0,
        governance: 0,
        'root-config': 0,
        artifacts: 0,
        misc: 0,
      },
      kindCounts: {
        source: 3,
        spec: 0,
        migration: 0,
        config: 0,
        document: 0,
        artifact: 0,
      },
      unmappedModuleCandidates: [],
      inventoryCoverage: 100,
      classificationCoverage: 100,
      structuralGraphCoverage: 100,
      testCoverage: 0,
      scenarioCoverage: 0,
      runtimeEvidenceCoverage: 0,
      productionProofCoverage: 0,
      orphanFiles: [],
      unknownFiles: [],
    },
    parity: {
      status: 'pass',
      mode: 'repo_inventory_with_codacy_spotcheck',
      confidence: 'high',
      reason: 'test',
      inventoryFiles: 3,
      codacyObservedFiles: 0,
      codacyObservedFilesCovered: 0,
      missingCodacyFiles: [],
    },
    codacy: {
      snapshotAvailable: false,
      sourcePath: null,
      syncedAt: null,
      ageMinutes: null,
      stale: false,
      loc: 0,
      totalIssues: 0,
      severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      toolCounts: {},
      topFiles: [],
      highPriorityBatch: [],
      observedFiles: [],
    },
    files: [
      {
        path: 'frontend/src/app/opaque/page.tsx',
        extension: '.tsx',
        lineCount: 30,
        surface: 'frontend',
        kind: 'source',
        runtimeCritical: false,
        userFacing: true,
        ownerLane: 'customer',
        executionMode: 'ai_safe',
        protectedByGovernance: false,
        codacyTracked: false,
        moduleCandidate: 'opaque',
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        highestObservedSeverity: null,
      },
      {
        path: 'backend/src/opaque/opaque.controller.ts',
        extension: '.ts',
        lineCount: 30,
        surface: 'backend',
        kind: 'source',
        runtimeCritical: false,
        userFacing: true,
        ownerLane: 'customer',
        executionMode: 'ai_safe',
        protectedByGovernance: false,
        codacyTracked: false,
        moduleCandidate: 'opaque',
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        highestObservedSeverity: null,
      },
      {
        path: 'backend/src/opaque/opaque.repository.ts',
        extension: '.ts',
        lineCount: 30,
        surface: 'backend',
        kind: 'source',
        runtimeCritical: false,
        userFacing: false,
        ownerLane: 'customer',
        executionMode: 'ai_safe',
        protectedByGovernance: false,
        codacyTracked: false,
        moduleCandidate: 'opaque',
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        highestObservedSeverity: null,
      },
    ],
    moduleAggregates: [
      {
        moduleKey: 'opaque',
        fileCount: 3,
        runtimeCriticalFileCount: 0,
        userFacingFileCount: 2,
        humanRequiredFileCount: 0,
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        surfaces: ['frontend', 'backend'],
      },
    ],
    excludedFiles: [],
    scopeSource: 'repo_filesystem',
    manifestBoundary: false,
    manifestRole: 'semantic_overlay',
  };
}

function resolvedManifest(): PulseResolvedManifest {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    sourceManifestPath: null,
    projectId: 'test',
    projectName: 'Test',
    systemType: 'test',
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

function capabilityState(): PulseCapabilityState {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalCapabilities: 1,
      realCapabilities: 1,
      partialCapabilities: 0,
      latentCapabilities: 0,
      phantomCapabilities: 0,
      humanRequiredCapabilities: 0,
      foundationalCapabilities: 0,
      connectedCapabilities: 0,
      operationalCapabilities: 1,
      productionReadyCapabilities: 0,
      runtimeObservedCapabilities: 0,
      scenarioCoveredCapabilities: 0,
    },
    capabilities: [
      {
        id: 'capability:opaque',
        name: 'Opaque',
        truthMode: 'inferred',
        status: 'real',
        confidence: 0.8,
        userFacing: true,
        runtimeCritical: false,
        protectedByGovernance: false,
        ownerLane: 'customer',
        executionMode: 'ai_safe',
        rolesPresent: ['interface', 'orchestration', 'persistence'],
        missingRoles: [],
        filePaths: [],
        nodeIds: ['ui:opaque', 'api:opaque', 'db:opaque'],
        routePatterns: ['/opaque/create'],
        evidenceSources: [],
        codacyIssueCount: 0,
        highSeverityIssueCount: 0,
        blockingReasons: [],
        validationTargets: [],
        maturity: {
          stage: 'operational',
          score: 0.8,
          dimensions: {
            interfacePresent: true,
            apiSurfacePresent: true,
            orchestrationPresent: true,
            persistencePresent: true,
            sideEffectPresent: false,
            runtimeEvidencePresent: false,
            validationPresent: true,
            scenarioCoveragePresent: false,
            codacyHealthy: true,
            simulationOnly: false,
          },
          missing: [],
        },
        dod: {
          status: 'partial',
          missingRoles: [],
          blockers: [],
          truthModeMet: false,
        },
      },
    ],
  };
}

function codebaseTruth(): PulseCodebaseTruth {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalPages: 1,
      userFacingPages: 1,
      discoveredModules: 1,
      discoveredFlows: 1,
      blockerCount: 0,
      warningCount: 0,
    },
    pages: [],
    discoveredModules: [],
    discoveredFlows: [
      {
        id: 'flow:opaque-create',
        moduleKey: 'opaque',
        moduleName: 'Opaque',
        pageRoute: '/opaque',
        elementLabel: 'Create Opaque',
        httpMethod: 'POST',
        endpoint: '/opaque/create',
        backendRoute: '/opaque/create',
        connected: true,
        persistent: true,
        semanticTokens: ['opaque', 'create'],
        declaredFlow: null,
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

function actorEvidence(): PulseActorEvidence {
  return {
    actorKind: 'customer',
    declared: [],
    executed: ['opaque-create'],
    missing: [],
    passed: ['opaque-create'],
    failed: [],
    artifactPaths: [],
    summary: 'dynamic actor bucket',
    results: [
      {
        scenarioId: 'opaque-create',
        actorKind: 'customer',
        scenarioKind: 'single-session',
        critical: true,
        requested: true,
        runner: 'derived',
        status: 'passed',
        executed: true,
        summary: 'passed',
        artifactPaths: [],
        specsExecuted: [],
        durationMs: 1,
        worldStateTouches: [],
        moduleKeys: ['opaque'],
        routePatterns: ['/opaque/create'],
      },
    ],
  };
}

describe('PULSE dynamic capability/product reconstruction', () => {
  it('derives product surfaces from scope and structural evidence without a fixed domain catalog', () => {
    const graph = structuralGraph([
      structuralNode({
        id: 'ui:opaque',
        kind: 'ui_element',
        role: 'interface',
        label: 'Opaque Button',
        file: 'frontend/src/app/opaque/page.tsx',
        metadata: { frontendPath: '/opaque' },
      }),
      structuralNode({
        id: 'api:opaque',
        label: 'Opaque Create',
        metadata: { endpoint: '/opaque/create' },
      }),
      structuralNode({
        id: 'db:opaque',
        kind: 'persistence_model',
        role: 'persistence',
        label: 'Opaque Record',
        file: 'backend/src/opaque/opaque.repository.ts',
      }),
    ]);

    const product = buildProductModel({
      structuralGraph: graph,
      scopeState: scopeState(),
      resolvedManifest: resolvedManifest(),
    });

    expect(product.surfaces.map((surface) => surface.id)).toContain('opaque');
    expect(product.capabilities.some((capability) => capability.surfaceId === 'opaque')).toBe(true);
    expect(product.surfaces.find((surface) => surface.id === 'opaque')?.description).toContain(
      '3 scoped file(s)',
    );
    expect(product.flows.map((flow) => flow.id)).toContain('flow-opaque-create');
    expect(
      product.flows.find((flow) => flow.id === 'flow-opaque-create')?.capabilities,
    ).toHaveLength(1);
  });

  it('uses a populated actor evidence bucket with scenario results when projecting flows', () => {
    const graph = structuralGraph([
      structuralNode({
        id: 'ui:opaque',
        kind: 'ui_element',
        role: 'interface',
        metadata: { frontendPath: '/opaque' },
      }),
      structuralNode({ id: 'api:opaque', metadata: { endpoint: '/opaque/create' } }),
      structuralNode({
        id: 'db:opaque',
        kind: 'persistence_model',
        role: 'persistence',
        metadata: {},
      }),
    ]);
    const executionEvidence: Partial<PulseExecutionEvidence> & Record<string, PulseActorEvidence> =
      {
        designer: actorEvidence(),
      };

    const projection = buildFlowProjection({
      structuralGraph: graph,
      capabilityState: capabilityState(),
      codebaseTruth: codebaseTruth(),
      resolvedManifest: resolvedManifest(),
      scopeState: scopeState(),
      executionEvidence,
    });

    expect(projection.flows).toHaveLength(1);
    expect(projection.flows[0].truthMode).toBe('observed');
    expect(projection.flows[0].evidenceSources).toContain('scenario-coverage');
  });
});
