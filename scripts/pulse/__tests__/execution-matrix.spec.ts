import { describe, expect, it } from 'vitest';
import { buildExecutionMatrix } from '../execution-matrix';
import {
  evaluateBreakpointPrecisionGate,
  evaluateCriticalPathObservedGate,
  evaluateExecutionMatrixCompleteGate,
} from '../cert-gate-execution-matrix';
import type {
  PulseActorEvidence,
  PulseCapability,
  PulseCapabilityState,
  PulseExecutionChain,
  PulseExecutionChainSet,
  PulseExecutionEvidence,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseScopeState,
  PulseStructuralGraph,
} from '../types';
const generatedAt = '2026-04-28T00:00:00.000Z';
function makeCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  return {
    id: 'checkout-capability',
    name: 'Checkout Capability',
    truthMode: 'inferred',
    status: 'real',
    confidence: 0.8,
    userFacing: true,
    runtimeCritical: true,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: 'ai_safe',
    rolesPresent: ['interface', 'orchestration', 'persistence'],
    missingRoles: [],
    filePaths: ['frontend/checkout.tsx', 'backend/checkout.controller.ts'],
    nodeIds: ['ui:checkout', 'api:checkout'],
    routePatterns: ['/api/checkout'],
    evidenceSources: ['structural_graph'],
    codacyIssueCount: 0,
    highSeverityIssueCount: 0,
    blockingReasons: [],
    validationTargets: ['PULSE_EXECUTION_MATRIX.json'],
    maturity: {
      stage: 'production_ready',
      score: 0.9,
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
    ...overrides,
  };
}
function makeFlow(overrides: Partial<PulseFlowProjectionItem> = {}): PulseFlowProjectionItem {
  return {
    id: 'checkout-flow',
    name: 'Checkout Flow',
    truthMode: 'inferred',
    status: 'real',
    confidence: 0.8,
    startNodeIds: ['ui:checkout'],
    endNodeIds: ['db:order'],
    routePatterns: ['/api/checkout'],
    capabilityIds: ['checkout-capability'],
    rolesPresent: ['interface', 'orchestration', 'persistence'],
    missingLinks: [],
    distanceToReal: 0,
    evidenceSources: ['structural_graph'],
    blockingReasons: [],
    validationTargets: ['PULSE_EXECUTION_MATRIX.json'],
    dod: {
      status: 'partial',
      missingRoles: [],
      blockers: [],
      truthModeMet: false,
    },
    ...overrides,
  };
}
function makeChain(overrides: Partial<PulseExecutionChain> = {}): PulseExecutionChain {
  return {
    id: 'chain:checkout',
    description: 'checkout chain',
    entrypoint: {
      id: 'ui:checkout:step0',
      role: 'trigger',
      nodeId: 'ui:checkout',
      description: 'checkout button',
      truthMode: 'inferred',
      filesInvolved: ['frontend/checkout.tsx'],
      modelsInvolved: [],
      providersInvolved: [],
    },
    steps: [
      {
        id: 'api:checkout:step1',
        role: 'controller',
        nodeId: 'api:checkout',
        description: 'checkout route',
        truthMode: 'inferred',
        filesInvolved: ['backend/checkout.controller.ts'],
        modelsInvolved: ['Order'],
        providersInvolved: [],
      },
    ],
    conditionalBranches: [],
    requiredState: [],
    sideEffects: [],
    completeness: { expectedSteps: 2, foundSteps: 2, score: 1 },
    failurePoints: [],
    completionProof: {
      indicator: 'checkout route',
      verification: 'final step: api:checkout',
      truthMode: 'inferred',
    },
    truthMode: 'inferred',
    confidence: { score: 0.9, evidenceBasis: ['test'], truthMode: 'inferred' },
    ...overrides,
  };
}
function makeActorEvidence(actorKind: PulseActorEvidence['actorKind']): PulseActorEvidence {
  return {
    actorKind,
    declared: [],
    executed: [],
    missing: [],
    passed: [],
    failed: [],
    artifactPaths: [],
    summary: `${actorKind} not executed`,
    results: [],
  };
}
function makeEvidence(overrides: Partial<PulseExecutionEvidence> = {}): PulseExecutionEvidence {
  return {
    runtime: {
      executed: false,
      executedChecks: [],
      blockingBreakTypes: [],
      artifactPaths: [],
      summary: 'runtime not executed',
      probes: [],
    },
    browser: {
      attempted: false,
      executed: false,
      artifactPaths: [],
      summary: 'browser not executed',
    },
    flows: {
      declared: [],
      executed: [],
      missing: [],
      passed: [],
      failed: [],
      accepted: [],
      artifactPaths: [],
      summary: 'flows not executed',
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
      summary: 'invariants not executed',
      results: [],
    },
    observability: {
      executed: false,
      summary: 'observability not executed',
      artifactPaths: [],
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
      summary: 'recovery not executed',
      artifactPaths: [],
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
    customer: makeActorEvidence('customer'),
    operator: makeActorEvidence('operator'),
    admin: makeActorEvidence('admin'),
    soak: makeActorEvidence('soak'),
    syntheticCoverage: {
      executed: false,
      artifactPaths: [],
      summary: 'coverage not executed',
      totalPages: 0,
      userFacingPages: 0,
      coveredPages: 0,
      uncoveredPages: [],
      results: [],
    },
    worldState: {
      generatedAt,
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
      generatedAt,
      updatedAt: generatedAt,
      phases: [],
      summary: 'test trace',
      artifactPaths: [],
    },
    ...overrides,
  };
}
function buildMatrix(args: {
  chain?: PulseExecutionChain;
  chains?: PulseExecutionChain[];
  capability?: PulseCapability;
  flow?: PulseFlowProjectionItem;
  evidence?: PulseExecutionEvidence;
  structuralGraph?: PulseStructuralGraph;
  scopeState?: PulseScopeState;
}) {
  const capability = args.capability ?? makeCapability();
  const flow = args.flow ?? makeFlow();
  const chains = args.chains ?? (args.chain ? [args.chain] : [makeChain()]);
  const executionChains: PulseExecutionChainSet = {
    chains,
    summary: {
      totalChains: chains.length,
      completeChains: chains.length,
      partialChains: 0,
      simulatedChains: 0,
      overallCompleteness: chains.length > 0 ? 1 : 0,
    },
  };
  const capabilityState: PulseCapabilityState = {
    generatedAt,
    summary: {
      totalCapabilities: 1,
      realCapabilities: 1,
      partialCapabilities: 0,
      latentCapabilities: 0,
      phantomCapabilities: 0,
      humanRequiredCapabilities: 0,
      foundationalCapabilities: 0,
      connectedCapabilities: 1,
      operationalCapabilities: 0,
      productionReadyCapabilities: 1,
      runtimeObservedCapabilities: 0,
      scenarioCoveredCapabilities: 0,
    },
    capabilities: [capability],
  };
  const flowProjection: PulseFlowProjection = {
    generatedAt,
    summary: {
      totalFlows: 1,
      realFlows: 1,
      partialFlows: 0,
      latentFlows: 0,
      phantomFlows: 0,
    },
    flows: [flow],
  };
  return buildExecutionMatrix({
    structuralGraph: args.structuralGraph ?? {
      generatedAt,
      summary: {
        totalNodes: 2,
        totalEdges: 1,
        roleCounts: {
          interface: 1,
          orchestration: 1,
          persistence: 0,
          side_effect: 0,
          simulation: 0,
        },
        interfaceChains: 1,
        completeChains: 1,
        partialChains: 0,
        simulatedChains: 0,
      },
      nodes: [
        {
          id: 'ui:checkout',
          kind: 'ui_element',
          role: 'interface',
          truthMode: 'inferred',
          adapter: 'test',
          label: 'checkout button',
          file: 'frontend/checkout.tsx',
          line: 1,
          userFacing: true,
          runtimeCritical: true,
          protectedByGovernance: false,
          metadata: {},
        },
        {
          id: 'api:checkout',
          kind: 'backend_route',
          role: 'orchestration',
          truthMode: 'inferred',
          adapter: 'test',
          label: 'checkout route',
          file: 'backend/checkout.controller.ts',
          line: 1,
          userFacing: false,
          runtimeCritical: true,
          protectedByGovernance: false,
          metadata: { route: '/api/checkout' },
        },
      ],
      edges: [
        {
          id: 'edge:checkout',
          from: 'ui:checkout',
          to: 'api:checkout',
          kind: 'calls',
          truthMode: 'inferred',
          evidence: 'test',
        },
      ],
    },
    scopeState: args.scopeState ?? {
      generatedAt,
      rootDir: '/repo',
      summary: {
        totalFiles: 2,
        totalLines: 20,
        runtimeCriticalFiles: 2,
        userFacingFiles: 1,
        humanRequiredFiles: 0,
        surfaceCounts: {
          frontend: 1,
          'frontend-admin': 0,
          backend: 1,
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
          source: 2,
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
        inventoryFiles: 2,
        codacyObservedFiles: 0,
        codacyObservedFilesCovered: 0,
        missingCodacyFiles: [],
      },
      codacy: {
        snapshotAvailable: true,
        sourcePath: 'PULSE_CODACY_STATE.json',
        stale: false,
        syncedAt: generatedAt,
        ageMinutes: 0,
        loc: 20,
        totalIssues: 0,
        severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
        toolCounts: {},
        topFiles: [],
        highPriorityBatch: [],
        observedFiles: [],
      },
      files: [
        {
          path: 'frontend/checkout.tsx',
          extension: '.tsx',
          lineCount: 10,
          surface: 'frontend',
          kind: 'source',
          runtimeCritical: true,
          userFacing: true,
          ownerLane: 'customer',
          executionMode: 'ai_safe',
          protectedByGovernance: false,
          codacyTracked: false,
          moduleCandidate: 'checkout',
          observedCodacyIssueCount: 0,
          highSeverityIssueCount: 0,
          highestObservedSeverity: null,
          structuralHints: ['interface'],
        },
        {
          path: 'backend/checkout.controller.ts',
          extension: '.ts',
          lineCount: 10,
          surface: 'backend',
          kind: 'source',
          runtimeCritical: true,
          userFacing: false,
          ownerLane: 'customer',
          executionMode: 'ai_safe',
          protectedByGovernance: false,
          codacyTracked: false,
          moduleCandidate: 'checkout',
          observedCodacyIssueCount: 0,
          highSeverityIssueCount: 0,
          highestObservedSeverity: null,
          structuralHints: ['orchestration'],
        },
      ],
      moduleAggregates: [],
      excludedFiles: [],
      scopeSource: 'repo_filesystem',
      manifestBoundary: false,
      manifestRole: 'semantic_overlay',
    },
    executionChains,
    capabilityState,
    flowProjection,
    executionEvidence: args.evidence ?? makeEvidence(),
  });
}
describe('buildExecutionMatrix', () => {
  it('maps a chain to capability and flow through node and capability ids', () => {
    const matrix = buildMatrix({});
    expect(matrix.summary.totalPaths).toBe(1);
    expect(matrix.paths[0].capabilityId).toBe('checkout-capability');
    expect(matrix.paths[0].flowId).toBe('checkout-flow');
  });
  it('keeps structural paths terminally reasoned when no executed evidence exists', () => {
    const matrix = buildMatrix({});
    expect(matrix.paths[0].status).toBe('inferred_only');
    expect(matrix.paths[0].truthMode).toBe('inferred');
    expect(matrix.paths[0].breakpoint?.reason).toContain('lacks observed runtime');
    expect(matrix.summary.criticalUnobservedPaths).toBe(0);
  });
  it('marks a matching executed passing flow as observed_pass', () => {
    const evidence = makeEvidence({
      flows: {
        declared: ['checkout-flow'],
        executed: ['checkout-flow'],
        missing: [],
        passed: ['checkout-flow'],
        failed: [],
        accepted: [],
        artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
        summary: 'checkout-flow passed',
        results: [
          {
            flowId: 'checkout-flow',
            status: 'passed',
            executed: true,
            accepted: false,
            summary: 'checkout-flow passed',
            artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_pass');
    expect(matrix.paths[0].truthMode).toBe('observed');
  });
  it('promotes matching actor route evidence to observed_pass', () => {
    const evidence = makeEvidence({
      customer: {
        ...makeActorEvidence('customer'),
        executed: ['customer-checkout'],
        passed: ['customer-checkout'],
        summary: 'customer checkout passed',
        results: [
          {
            scenarioId: 'customer-checkout',
            actorKind: 'customer',
            scenarioKind: 'single-session',
            critical: true,
            requested: true,
            runner: 'derived',
            status: 'passed',
            executed: true,
            truthMode: 'observed',
            summary: 'checkout scenario passed',
            artifactPaths: ['PULSE_SCENARIO_EVIDENCE.json'],
            specsExecuted: ['checkout.spec.ts'],
            durationMs: 100,
            worldStateTouches: ['order'],
            moduleKeys: ['checkout'],
            routePatterns: ['/api/checkout'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_pass');
    expect(matrix.paths[0].observedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'actor',
          artifactPath: 'PULSE_SCENARIO_EVIDENCE.json',
          status: 'passed',
        }),
      ]),
    );
  });
  it('keeps inferred critical paths explainable with a concrete missing evidence breakpoint', () => {
    const matrix = buildMatrix({});
    expect(matrix.paths[0].status).toBe('inferred_only');
    expect(matrix.paths[0].breakpoint?.reason).toContain('lacks observed runtime');
    expect(matrix.paths[0].breakpoint?.recovery).toContain('matching runtime');
  });
  it('keeps not-executable critical capabilities terminally explainable', () => {
    const matrix = buildMatrix({
      chains: [],
      capability: makeCapability({
        routePatterns: [],
        nodeIds: [],
      }),
      flow: makeFlow({
        routePatterns: [],
        startNodeIds: [],
        endNodeIds: [],
      }),
      structuralGraph: {
        generatedAt,
        summary: {
          totalNodes: 0,
          totalEdges: 0,
          roleCounts: {
            interface: 0,
            orchestration: 0,
            persistence: 0,
            side_effect: 0,
            simulation: 0,
          },
          interfaceChains: 0,
          completeChains: 0,
          partialChains: 0,
          simulatedChains: 0,
        },
        nodes: [],
        edges: [],
      },
    });
    const capabilityPath = matrix.paths.find((path) => path.source === 'capability');
    expect(capabilityPath?.status).toBe('not_executable');
    expect(capabilityPath?.breakpoint?.reason).toContain('no executable chain');
    expect(matrix.summary.criticalUnobservedPaths).toBe(0);
  });
  it('marks a matching executed failing flow as observed_fail with breakpoint', () => {
    const evidence = makeEvidence({
      flows: {
        declared: ['checkout-flow'],
        executed: ['checkout-flow'],
        missing: [],
        passed: [],
        failed: ['checkout-flow'],
        accepted: [],
        artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
        summary: 'checkout-flow failed',
        results: [
          {
            flowId: 'checkout-flow',
            status: 'failed',
            executed: true,
            accepted: false,
            failureClass: 'product_failure',
            summary: 'checkout endpoint returned 500',
            artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_fail');
    expect(matrix.paths[0].breakpoint?.reason).toContain('500');
    expect(matrix.summary.impreciseBreakpoints).toBe(0);
  });
  it('maps matching browser failure evidence to an observed failure breakpoint', () => {
    const evidence = makeEvidence({
      browser: {
        attempted: true,
        executed: true,
        artifactPaths: ['PULSE_BROWSER_EVIDENCE.json'],
        summary: 'Playwright route /api/checkout returned 500 in checkout-flow',
        failureCode: 'ok',
        totalPages: 1,
        totalTested: 1,
        passRate: 0,
        blockingInteractions: 1,
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(matrix.paths[0].status).toBe('observed_fail');
    expect(matrix.paths[0].observedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'browser',
          status: 'failed',
        }),
      ]),
    );
    expect(matrix.paths[0].breakpoint?.routePattern).toBe('/api/checkout');
    expect(matrix.summary.impreciseBreakpoints).toBe(0);
  });
  it('includes conditional branch steps and files in the chain path', () => {
    const matrix = buildMatrix({
      chain: makeChain({
        conditionalBranches: [
          {
            condition: 'async fulfillment',
            steps: [
              {
                id: 'worker:checkout:step2',
                role: 'worker',
                nodeId: 'worker:checkout',
                description: 'checkout worker',
                truthMode: 'inferred',
                filesInvolved: ['worker/checkout.worker.ts'],
                modelsInvolved: [],
                providersInvolved: [],
              },
            ],
          },
        ],
      }),
    });
    expect(matrix.paths[0].chain.map((step) => step.nodeId)).toContain('worker:checkout');
    expect(matrix.paths[0].filePaths).toContain('worker/checkout.worker.ts');
  });
  it('summarizes paths by source and terminal status for gates', () => {
    const matrix = buildMatrix({});
    expect(matrix.summary.bySource.execution_chain).toBe(1);
    expect(matrix.summary.byStatus.inferred_only).toBe(1);
    expect(matrix.summary.terminalPaths).toBe(matrix.summary.totalPaths);
    expect(matrix.summary.nonTerminalPaths).toBe(0);
    expect(matrix.summary.unknownPaths).toBe(0);
  });
  it('passes matrix completeness and critical terminal classification with precise governed reasons', () => {
    const matrix = buildMatrix({});
    const path = matrix.paths[0];

    expect(path.risk).toBe('high');
    expect(path.executionMode).toBe('governed_validation');
    expect(path.requiredEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'integration', required: true }),
        expect.objectContaining({ kind: 'e2e', required: true }),
        expect.objectContaining({ kind: 'runtime', required: true }),
      ]),
    );
    expect(path.observedEvidence).toEqual([
      expect.objectContaining({
        source: 'static',
        artifactPath: 'PULSE_CERTIFICATE.json',
        executed: true,
        status: 'mapped',
      }),
    ]);
    expect(path.breakpoint).toEqual(
      expect.objectContaining({
        filePath: 'frontend/checkout.tsx',
        nodeId: 'ui:checkout',
        routePattern: '/api/checkout',
      }),
    );
    expect(path.breakpoint?.reason).toContain('lacks observed runtime');
    expect(path.breakpoint?.recovery).toContain('matching runtime');
    expect(path.validationCommand).toContain('route /api/checkout');

    expect(evaluateExecutionMatrixCompleteGate(matrix).status).toBe('pass');
    const observedGate = evaluateCriticalPathObservedGate(matrix);
    expect(observedGate.status).toBe('pass');
    expect(observedGate.evidenceMode).toBe('inferred');
    expect(observedGate.reason).toContain('precise terminal reason');
    expect(observedGate.reason).toContain('still need observed proof');
  });

  it('fails critical path gate when path coverage still reports critical unobserved work', () => {
    const matrix = buildMatrix({});
    const observedGate = evaluateCriticalPathObservedGate(matrix, {
      summary: {
        criticalUnobserved: 1,
      },
    });

    expect(observedGate.status).toBe('fail');
    expect(observedGate.reason).toContain(
      'PULSE_PATH_COVERAGE.json still has 1 critical unobserved path',
    );
    expect(observedGate.reason).toContain('matching validation probe');
  });

  it('fails critical path gate when inferred critical paths lack a precise terminal reason', () => {
    const matrix = buildMatrix({});
    matrix.paths[0].breakpoint = null;
    const observedGate = evaluateCriticalPathObservedGate(matrix);
    expect(observedGate.status).toBe('fail');
    expect(observedGate.reason).toContain('critical path(s) without observed evidence');
  });
  it('passes critical observation and breakpoint precision after observed failure is precise', () => {
    const evidence = makeEvidence({
      flows: {
        declared: ['checkout-flow'],
        executed: ['checkout-flow'],
        missing: [],
        passed: [],
        failed: ['checkout-flow'],
        accepted: [],
        artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
        summary: 'checkout-flow failed',
        results: [
          {
            flowId: 'checkout-flow',
            status: 'failed',
            executed: true,
            accepted: false,
            summary: 'checkout endpoint returned 500',
            artifactPaths: ['PULSE_FLOW_EVIDENCE.json'],
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });
    expect(evaluateCriticalPathObservedGate(matrix).status).toBe('pass');
    expect(evaluateBreakpointPrecisionGate(matrix).status).toBe('pass');
  });
  it('adds uncovered structural nodes so parser-discovered code cannot escape scope', () => {
    const matrix = buildMatrix({
      structuralGraph: {
        generatedAt,
        summary: {
          totalNodes: 1,
          totalEdges: 0,
          roleCounts: {
            interface: 1,
            orchestration: 0,
            persistence: 0,
            side_effect: 0,
            simulation: 0,
          },
          interfaceChains: 0,
          completeChains: 0,
          partialChains: 0,
          simulatedChains: 0,
        },
        nodes: [
          {
            id: 'ui:uncovered',
            kind: 'ui_element',
            role: 'interface',
            truthMode: 'inferred',
            adapter: 'test',
            label: 'Uncovered button',
            file: 'frontend/uncovered.tsx',
            line: 1,
            userFacing: true,
            runtimeCritical: true,
            protectedByGovernance: false,
            metadata: {},
          },
        ],
        edges: [],
      },
    });
    expect(matrix.paths.some((path) => path.source === 'structural_node')).toBe(true);
    expect(matrix.paths.find((path) => path.source === 'structural_node')?.status).toBe(
      'inferred_only',
    );
  });
  it('adds uncovered scope files so repo inventory cannot escape matrix classification', () => {
    const matrix = buildMatrix({
      scopeState: {
        generatedAt,
        rootDir: '/repo',
        summary: {
          totalFiles: 1,
          totalLines: 10,
          runtimeCriticalFiles: 0,
          userFacingFiles: 0,
          humanRequiredFiles: 0,
          surfaceCounts: {
            frontend: 0,
            'frontend-admin': 0,
            backend: 0,
            worker: 0,
            prisma: 0,
            e2e: 0,
            scripts: 1,
            docs: 0,
            infra: 0,
            governance: 0,
            'root-config': 0,
            artifacts: 0,
            misc: 0,
          },
          kindCounts: {
            source: 1,
            spec: 0,
            migration: 0,
            config: 0,
            document: 0,
            artifact: 0,
          },
          unmappedModuleCandidates: [],
          inventoryCoverage: 100,
          classificationCoverage: 100,
          structuralGraphCoverage: 0,
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
          inventoryFiles: 1,
          codacyObservedFiles: 0,
          codacyObservedFilesCovered: 0,
          missingCodacyFiles: [],
        },
        codacy: {
          snapshotAvailable: true,
          sourcePath: 'PULSE_CODACY_STATE.json',
          syncedAt: generatedAt,
          ageMinutes: 0,
          stale: false,
          loc: 10,
          totalIssues: 0,
          severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
          toolCounts: {},
          topFiles: [],
          highPriorityBatch: [],
          observedFiles: [],
        },
        files: [
          {
            path: 'scripts/pulse/new-parser.ts',
            extension: '.ts',
            lineCount: 10,
            surface: 'scripts',
            kind: 'source',
            runtimeCritical: false,
            userFacing: false,
            ownerLane: 'platform',
            executionMode: 'ai_safe',
            protectedByGovernance: false,
            codacyTracked: false,
            moduleCandidate: 'pulse',
            observedCodacyIssueCount: 0,
            highSeverityIssueCount: 0,
            highestObservedSeverity: null,
            structuralHints: ['orchestration'],
          },
        ],
        moduleAggregates: [],
        excludedFiles: [],
        scopeSource: 'repo_filesystem',
        manifestBoundary: false,
        manifestRole: 'semantic_overlay',
      },
    });
    expect(matrix.paths.some((path) => path.source === 'scope_file')).toBe(true);
    expect(matrix.paths.find((path) => path.source === 'scope_file')?.filePaths).toContain(
      'scripts/pulse/new-parser.ts',
    );
    expect(matrix.paths.find((path) => path.source === 'scope_file')?.status).toBe(
      'not_executable',
    );
    expect(matrix.paths.find((path) => path.source === 'scope_file')?.breakpoint?.reason).toContain(
      'inventory fallback',
    );
  });
});
