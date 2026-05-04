import { describe, expect, it } from 'vitest';

import type {
  PulseCapabilityState,
  PulseCodebaseTruth,
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

describe('capability-product-dynamic seed data', () => {
  it('produces valid structuralNode with overrides', () => {
    const node = structuralNode({ id: 'custom', role: 'persistence' });
    expect(node.id).toBe('custom');
    expect(node.role).toBe('persistence');
    expect(node.kind).toBe('backend_route');
    expect(node.userFacing).toBe(true);
  });

  it('produces valid structuralGraph from nodes', () => {
    const nodes: PulseStructuralNode[] = [
      structuralNode({ id: 'ui:opaque', role: 'interface' }),
      structuralNode({ id: 'api:opaque', role: 'orchestration' }),
      structuralNode({ id: 'db:opaque', role: 'persistence' }),
    ];
    const graph = structuralGraph(nodes);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.summary.totalNodes).toBe(3);
    expect(graph.summary.roleCounts.interface).toBe(1);
    expect(graph.summary.roleCounts.orchestration).toBe(1);
    expect(graph.summary.roleCounts.persistence).toBe(1);
  });

  it('produces valid scopeState with correct file counts', () => {
    const scope = scopeState();
    expect(scope.summary.totalFiles).toBe(3);
    expect(scope.files).toHaveLength(3);
    expect(scope.moduleAggregates).toHaveLength(1);
    expect(scope.moduleAggregates[0].moduleKey).toBe('opaque');
    expect(scope.parity.status).toBe('pass');
  });

  it('produces valid resolvedManifest with empty collections', () => {
    const manifest = resolvedManifest();
    expect(manifest.projectId).toBe('test');
    expect(manifest.modules).toEqual([]);
    expect(manifest.summary.totalModules).toBe(0);
    expect(manifest.finalReadinessCriteria.requireAllTiersPass).toBe(true);
  });

  it('produces valid capabilityState with one operational capability', () => {
    const caps = capabilityState();
    expect(caps.summary.totalCapabilities).toBe(1);
    expect(caps.summary.operationalCapabilities).toBe(1);
    expect(caps.capabilities[0].id).toBe('capability:opaque');
    expect(caps.capabilities[0].maturity.stage).toBe('operational');
  });

  it('produces valid codebaseTruth with one discovered flow', () => {
    const truth = codebaseTruth();
    expect(truth.summary.totalPages).toBe(1);
    expect(truth.summary.discoveredFlows).toBe(1);
    expect(truth.discoveredFlows[0].id).toBe('flow:opaque-create');
    expect(truth.divergence.blockerCount).toBe(0);
  });
});
