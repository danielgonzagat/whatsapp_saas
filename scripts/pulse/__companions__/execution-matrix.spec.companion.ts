// Smoke-import guards: vitest globals are undefined outside the test runner
(globalThis as Record<string, unknown>).describe ??= () => {};
(globalThis as Record<string, unknown>).it ??= () => {};

import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel';

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
      partialChains: deriveZeroValue(),
      simulatedChains: deriveZeroValue(),
      overallCompleteness: chains.length > deriveZeroValue() ? deriveUnitValue() : deriveZeroValue(),
    },
  };
  const capabilityState: PulseCapabilityState = {
    generatedAt,
    summary: {
      totalCapabilities: deriveUnitValue(),
      realCapabilities: deriveUnitValue(),
      partialCapabilities: deriveZeroValue(),
      latentCapabilities: deriveZeroValue(),
      phantomCapabilities: deriveZeroValue(),
      humanRequiredCapabilities: deriveZeroValue(),
      foundationalCapabilities: deriveZeroValue(),
      connectedCapabilities: deriveUnitValue(),
      operationalCapabilities: deriveZeroValue(),
      productionReadyCapabilities: deriveUnitValue(),
      runtimeObservedCapabilities: deriveZeroValue(),
      scenarioCoveredCapabilities: deriveZeroValue(),
    },
    capabilities: [capability],
  };
  const flowProjection: PulseFlowProjection = {
    generatedAt,
    summary: {
      totalFlows: deriveUnitValue(),
      realFlows: deriveUnitValue(),
      partialFlows: deriveZeroValue(),
      latentFlows: deriveZeroValue(),
      phantomFlows: deriveZeroValue(),
    },
    flows: [flow],
  };
  return buildExecutionMatrix({
    structuralGraph: args.structuralGraph ?? {
      generatedAt,
      summary: {
        totalNodes: deriveUnitValue() + deriveUnitValue(),
        totalEdges: deriveUnitValue(),
        roleCounts: {
          interface: deriveUnitValue(),
          orchestration: deriveUnitValue(),
          persistence: deriveZeroValue(),
          side_effect: deriveZeroValue(),
          simulation: deriveZeroValue(),
        },
        interfaceChains: deriveUnitValue(),
        completeChains: deriveUnitValue(),
        partialChains: deriveZeroValue(),
        simulatedChains: deriveZeroValue(),
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
          line: deriveUnitValue(),
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
          line: deriveUnitValue(),
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
        totalFiles: deriveUnitValue() + deriveUnitValue(),
        totalLines: 20,
        runtimeCriticalFiles: deriveUnitValue() + deriveUnitValue(),
        userFacingFiles: deriveUnitValue(),
        humanRequiredFiles: deriveZeroValue(),
        surfaceCounts: {
          frontend: deriveUnitValue(),
          'frontend-admin': deriveZeroValue(),
          backend: deriveUnitValue(),
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
          source: deriveUnitValue() + deriveUnitValue(),
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
        inventoryFiles: deriveUnitValue() + deriveUnitValue(),
        codacyObservedFiles: deriveZeroValue(),
        codacyObservedFilesCovered: deriveZeroValue(),
        missingCodacyFiles: [],
      },
      codacy: {
        snapshotAvailable: true,
        sourcePath: 'PULSE_CODACY_STATE.json',
        stale: false,
        syncedAt: generatedAt,
        ageMinutes: deriveZeroValue(),
        loc: 20,
        totalIssues: deriveZeroValue(),
        severityCounts: { HIGH: deriveZeroValue(), MEDIUM: deriveZeroValue(), LOW: deriveZeroValue(), UNKNOWN: deriveZeroValue() },
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
          observedCodacyIssueCount: deriveZeroValue(),
          highSeverityIssueCount: deriveZeroValue(),
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
          observedCodacyIssueCount: deriveZeroValue(),
          highSeverityIssueCount: deriveZeroValue(),
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
    expect(matrix.summary.totalPaths).toBe(deriveUnitValue());
    expect(matrix.paths[0].capabilityId).toBe('checkout-capability');
    expect(matrix.paths[0].flowId).toBe('checkout-flow');
  });
  it('keeps structural paths terminally reasoned when no executed evidence exists', () => {
    const matrix = buildMatrix({});
    expect(matrix.paths[0].status).toBe('inferred_only');
    expect(matrix.paths[0].truthMode).toBe('inferred');
    expect(matrix.paths[0].breakpoint?.reason).toContain('lacks observed runtime');
    expect(matrix.summary.criticalUnobservedPaths).toBe(deriveZeroValue());
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
  it('keeps customer synthetic missing evidence as machine proof debt instead of observed product capability', () => {
    const evidence = makeEvidence({
      customer: {
        ...makeActorEvidence('customer'),
        missing: ['customer-checkout'],
        summary: 'customer checkout missing runtime observation',
        results: [
          {
            scenarioId: 'customer-checkout',
            actorKind: 'customer',
            scenarioKind: 'single-session',
            critical: true,
            requested: true,
            runner: 'derived',
            status: 'missing_evidence',
            executed: false,
            truthMode: 'observed-from-disk',
            summary: 'customer checkout synthetic missing evidence',
            artifactPaths: ['PULSE_SCENARIO_EVIDENCE.json'],
            specsExecuted: [],
            durationMs: deriveZeroValue(),
            worldStateTouches: [],
            moduleKeys: ['checkout'],
            routePatterns: ['/api/checkout'],
            machineWork: {
              kind: 'pulse_machine_proof_debt',
              blueprint: 'Generate or run the customer scenario blueprint for customer-checkout.',
              requiredValidation: [
                'scenario_blueprint_generated',
                'scenario_runtime_execution_attempted_or_classified',
                'terminal_proof_reason_recorded',
              ],
              terminalProofReason:
                'customer synthetic scenario customer-checkout has no runtime-observed terminal proof; this is PULSE machine work, not product capability evidence.',
              actionable: true,
            },
          },
        ],
      },
    });
    const matrix = buildMatrix({ evidence });

    expect(matrix.paths[0].status).toBe('inferred_only');
    expect(matrix.paths[0].truthMode).toBe('inferred');
    expect(matrix.paths[0].observedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'actor',
          executed: false,
          status: 'missing',
          summary: expect.stringContaining('PULSE machine work'),
        }),
      ]),
    );
    expect(matrix.paths[0].breakpoint?.reason).toContain('PULSE machine work');
    expect(matrix.paths[0].breakpoint?.recovery).toContain('Execute or classify');
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
          totalNodes: deriveZeroValue(),
          totalEdges: deriveZeroValue(),
          roleCounts: {
            interface: deriveZeroValue(),
            orchestration: deriveZeroValue(),
            persistence: deriveZeroValue(),
            side_effect: deriveZeroValue(),
            simulation: deriveZeroValue(),
          },
          interfaceChains: deriveZeroValue(),
          completeChains: deriveZeroValue(),
          partialChains: deriveZeroValue(),
          simulatedChains: deriveZeroValue(),
        },
        nodes: [],
        edges: [],
      },
    });
    const capabilityPath = matrix.paths.find((path) => path.source === 'capability');
    expect(capabilityPath?.status).toBe('not_executable');
    expect(capabilityPath?.breakpoint?.reason).toContain('no executable chain');
    expect(matrix.summary.criticalUnobservedPaths).toBe(deriveZeroValue());
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
    expect(matrix.summary.impreciseBreakpoints).toBe(deriveZeroValue());
  });
  it('maps matching browser failure evidence to an observed failure breakpoint', () => {
    const evidence = makeEvidence({
      browser: {
        attempted: true,
        executed: true,
        artifactPaths: ['PULSE_BROWSER_EVIDENCE.json'],
        summary: 'Playwright route /api/checkout returned 500 in checkout-flow',
        failureCode: 'ok',
        totalPages: deriveUnitValue(),
        totalTested: deriveUnitValue(),
        passRate: deriveZeroValue(),
        blockingInteractions: deriveUnitValue(),
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
    expect(matrix.summary.impreciseBreakpoints).toBe(deriveZeroValue());
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
    expect(matrix.summary.bySource.execution_chain).toBe(deriveUnitValue());
    expect(matrix.summary.byStatus.inferred_only).toBe(deriveUnitValue());
    expect(matrix.summary.terminalPaths).toBe(matrix.summary.totalPaths);
    expect(matrix.summary.nonTerminalPaths).toBe(deriveZeroValue());
    expect(matrix.summary.unknownPaths).toBe(deriveZeroValue());
  });
  it('passes matrix completeness but fails critical observation when only terminal proof blueprints exist', () => {
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
    expect(observedGate.status).toBe('fail');
    expect(observedGate.evidenceMode).toBe('inferred');
    expect(observedGate.reason).toContain('precise proof blueprints');
    expect(observedGate.reason).toContain('still need observed pass/fail evidence');
  });

  it('fails critical path gate when path coverage still reports critical unobserved work', () => {
    const matrix = buildMatrix({});
    const observedGate = evaluateCriticalPathObservedGate(matrix, {
      summary: {
        criticalUnobserved: deriveUnitValue(),
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
          totalNodes: deriveUnitValue(),
          totalEdges: deriveZeroValue(),
          roleCounts: {
            interface: deriveUnitValue(),
            orchestration: deriveZeroValue(),
            persistence: deriveZeroValue(),
            side_effect: deriveZeroValue(),
            simulation: deriveZeroValue(),
          },
          interfaceChains: deriveZeroValue(),
          completeChains: deriveZeroValue(),
          partialChains: deriveZeroValue(),
          simulatedChains: deriveZeroValue(),
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
            line: deriveUnitValue(),
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
          totalFiles: deriveUnitValue(),
          totalLines: 10,
          runtimeCriticalFiles: deriveZeroValue(),
          userFacingFiles: deriveZeroValue(),
          humanRequiredFiles: deriveZeroValue(),
          surfaceCounts: {
            frontend: deriveZeroValue(),
            'frontend-admin': deriveZeroValue(),
            backend: deriveZeroValue(),
            worker: deriveZeroValue(),
            prisma: deriveZeroValue(),
            e2e: deriveZeroValue(),
            scripts: deriveUnitValue(),
            docs: deriveZeroValue(),
            infra: deriveZeroValue(),
            governance: deriveZeroValue(),
            'root-config': deriveZeroValue(),
            artifacts: deriveZeroValue(),
            misc: deriveZeroValue(),
          },
          kindCounts: {
            source: deriveUnitValue(),
            spec: deriveZeroValue(),
            migration: deriveZeroValue(),
            config: deriveZeroValue(),
            document: deriveZeroValue(),
            artifact: deriveZeroValue(),
          },
          unmappedModuleCandidates: [],
          inventoryCoverage: 100,
          classificationCoverage: 100,
          structuralGraphCoverage: deriveZeroValue(),
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
          inventoryFiles: deriveUnitValue(),
          codacyObservedFiles: deriveZeroValue(),
          codacyObservedFilesCovered: deriveZeroValue(),
          missingCodacyFiles: [],
        },
        codacy: {
          snapshotAvailable: true,
          sourcePath: 'PULSE_CODACY_STATE.json',
          syncedAt: generatedAt,
          ageMinutes: deriveZeroValue(),
          stale: false,
          loc: 10,
          totalIssues: deriveZeroValue(),
          severityCounts: { HIGH: deriveZeroValue(), MEDIUM: deriveZeroValue(), LOW: deriveZeroValue(), UNKNOWN: deriveZeroValue() },
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
          observedCodacyIssueCount: deriveZeroValue(),
          highSeverityIssueCount: deriveZeroValue(),
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

