import { describe, expect, it } from 'vitest';

import { deriveUnitValue, deriveZeroValue } from '../dynamic-reality-kernel';
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
    line: deriveUnitValue(),
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
      totalEdges: deriveUnitValue() + deriveUnitValue(),
      roleCounts: {
        interface: nodes.filter((node) => node.role === 'interface').length,
        orchestration: nodes.filter((node) => node.role === 'orchestration').length,
        persistence: nodes.filter((node) => node.role === 'persistence').length,
        side_effect: nodes.filter((node) => node.role === 'side_effect').length,
        simulation: deriveZeroValue(),
      },
      interfaceChains: deriveUnitValue(),
      completeChains: deriveUnitValue(),
      partialChains: deriveZeroValue(),
      simulatedChains: deriveZeroValue(),
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
      totalFiles: deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
      totalLines: 90,
      runtimeCriticalFiles: deriveZeroValue(),
      userFacingFiles: deriveUnitValue(),
      humanRequiredFiles: deriveZeroValue(),
      surfaceCounts: {
        frontend: deriveUnitValue(),
        'frontend-admin': deriveZeroValue(),
        backend: deriveUnitValue() + deriveUnitValue(),
        worker: deriveZeroValue(),
        prisma: deriveZeroValue(),
        e2e: deriveZeroValue(),
        scripts: deriveZeroValue(),
        docs: deriveZeroValue(),
        infra: deriveZeroValue(),
        governance: deriveZeroValue(),
        'root-config': deriveZeroValue(),
        artifacts: deriveZeroValue(),
        misc: deriveZeroValue(),
      },
      kindCounts: {
        source: deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
        spec: deriveZeroValue(),
        migration: deriveZeroValue(),
        config: deriveZeroValue(),
        document: deriveZeroValue(),
        artifact: deriveZeroValue(),
      },
      unmappedModuleCandidates: [],
      inventoryCoverage: 100,
      classificationCoverage: 100,
      structuralGraphCoverage: 100,
      testCoverage: deriveZeroValue(),
      scenarioCoverage: deriveZeroValue(),
      runtimeEvidenceCoverage: deriveZeroValue(),
      productionProofCoverage: deriveZeroValue(),
      orphanFiles: [],
      unknownFiles: [],
    },
    parity: {
      status: 'pass',
      mode: 'repo_inventory_with_codacy_spotcheck',
      confidence: 'high',
      reason: 'test',
      inventoryFiles: deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
      codacyObservedFiles: deriveZeroValue(),
      codacyObservedFilesCovered: deriveZeroValue(),
      missingCodacyFiles: [],
    },
    codacy: {
      snapshotAvailable: false,
      sourcePath: null,
      syncedAt: null,
      ageMinutes: null,
      stale: false,
      loc: deriveZeroValue(),
      totalIssues: deriveZeroValue(),
      severityCounts: { HIGH: deriveZeroValue(), MEDIUM: deriveZeroValue(), LOW: deriveZeroValue(), UNKNOWN: 0 },
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
        observedCodacyIssueCount: deriveZeroValue(),
        highSeverityIssueCount: deriveZeroValue(),
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
        observedCodacyIssueCount: deriveZeroValue(),
        highSeverityIssueCount: deriveZeroValue(),
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
        observedCodacyIssueCount: deriveZeroValue(),
        highSeverityIssueCount: deriveZeroValue(),
        highestObservedSeverity: null,
      },
    ],
    moduleAggregates: [
      {
        moduleKey: 'opaque',
        fileCount: deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
        runtimeCriticalFileCount: deriveZeroValue(),
        userFacingFileCount: deriveUnitValue() + deriveUnitValue(),
        humanRequiredFileCount: deriveZeroValue(),
        observedCodacyIssueCount: deriveZeroValue(),
        highSeverityIssueCount: deriveZeroValue(),
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
      totalModules: deriveZeroValue(),
      resolvedModules: deriveZeroValue(),
      unresolvedModules: deriveZeroValue(),
      scopeOnlyModuleCandidates: deriveZeroValue(),
      humanRequiredModules: deriveZeroValue(),
      totalFlowGroups: deriveZeroValue(),
      resolvedFlowGroups: deriveZeroValue(),
      unresolvedFlowGroups: deriveZeroValue(),
      orphanManualModules: deriveZeroValue(),
      orphanFlowSpecs: deriveZeroValue(),
      excludedModules: deriveZeroValue(),
      excludedFlowGroups: deriveZeroValue(),
      groupedFlowGroups: deriveZeroValue(),
      sharedCapabilityGroups: deriveZeroValue(),
      opsInternalFlowGroups: deriveZeroValue(),
      legacyNoiseFlowGroups: deriveZeroValue(),
      legacyManualModules: deriveZeroValue(),
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
      blockerCount: deriveZeroValue(),
      warningCount: deriveZeroValue(),
    },
  };
}

function capabilityState(): PulseCapabilityState {
  return {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalCapabilities: deriveUnitValue(),
      realCapabilities: deriveUnitValue(),
      partialCapabilities: deriveZeroValue(),
      latentCapabilities: deriveZeroValue(),
      phantomCapabilities: deriveZeroValue(),
      humanRequiredCapabilities: deriveZeroValue(),
      foundationalCapabilities: deriveZeroValue(),
      connectedCapabilities: deriveZeroValue(),
      operationalCapabilities: deriveUnitValue(),
      productionReadyCapabilities: deriveZeroValue(),
      runtimeObservedCapabilities: deriveZeroValue(),
      scenarioCoveredCapabilities: deriveZeroValue(),
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
        codacyIssueCount: deriveZeroValue(),
        highSeverityIssueCount: deriveZeroValue(),
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
      totalPages: deriveUnitValue(),
      userFacingPages: deriveUnitValue(),
      discoveredModules: deriveUnitValue(),
      discoveredFlows: deriveUnitValue(),
      blockerCount: deriveZeroValue(),
      warningCount: deriveZeroValue(),
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
      blockerCount: deriveZeroValue(),
      warningCount: deriveZeroValue(),
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
        durationMs: deriveUnitValue(),
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
    ).toHaveLength(deriveUnitValue());
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

    expect(projection.flows).toHaveLength(deriveUnitValue());
    expect(projection.flows[0].truthMode).toBe('observed');
    expect(projection.flows[0].evidenceSources).toContain('scenario-coverage');
  });
});
