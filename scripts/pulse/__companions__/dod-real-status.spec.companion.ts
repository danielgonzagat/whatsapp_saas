describe('DoD real-status guardrails', () => {
  it('keeps sparse structural evidence as a raw latent signal instead of a fixed-ratio decision', () => {
    const root = makeTempRoot();
    const pulseDir = path.join(root, '.pulse', 'current');
    const sourceDir = path.join(root, 'src', 'opaque');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, 'opaque.service.ts'),
      ['@Injectable()', 'export class OpaqueService {}'].join('\n'),
    );

    const capability: PulseCapability = {
      id: 'capability:opaque-service-signal',
      name: 'Opaque service signal',
      truthMode: 'inferred',
      status: 'latent',
      confidence: 0.2,
      userFacing: true,
      runtimeCritical: false,
      protectedByGovernance: false,
      ownerLane: 'customer',
      executionMode: 'ai_safe',
      rolesPresent: ['orchestration'],
      missingRoles: [],
      filePaths: ['src/opaque/opaque.service.ts'],
      nodeIds: [],
      routePatterns: [],
      evidenceSources: ['structural_graph'],
      codacyIssueCount: 0,
      highSeverityIssueCount: 0,
      blockingReasons: [],
      validationTargets: [],
      maturity: {
        stage: 'foundational',
        score: 0.2,
        dimensions: {
          interfacePresent: false,
          apiSurfacePresent: false,
          orchestrationPresent: true,
          persistencePresent: false,
          sideEffectPresent: false,
          runtimeEvidencePresent: false,
          validationPresent: false,
          scenarioCoveragePresent: false,
          codacyHealthy: true,
          simulationOnly: false,
        },
        missing: ['runtime_evidence'],
      },
      dod: {
        status: 'latent',
        missingRoles: ['runtime_evidence'],
        blockers: [],
        truthModeMet: false,
      },
    };

    const capabilityState: PulseCapabilityState = {
      generatedAt,
      summary: {
        totalCapabilities: 1,
        realCapabilities: 0,
        partialCapabilities: 0,
        latentCapabilities: 1,
        phantomCapabilities: 0,
        humanRequiredCapabilities: 0,
        foundationalCapabilities: 0,
        connectedCapabilities: 0,
        operationalCapabilities: 0,
        productionReadyCapabilities: 0,
        runtimeObservedCapabilities: 0,
        scenarioCoveredCapabilities: 0,
      },
      capabilities: [capability],
    };
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_CAPABILITY_STATE.json'),
      JSON.stringify(capabilityState, null, 2),
    );

    buildDoDEngineState(root);

    const dodState = JSON.parse(
      fs.readFileSync(path.join(pulseDir, 'PULSE_DOD_STATE.json'), 'utf8'),
    ) as DoDState;
    expect(dodState.capabilities[0]?.classification).toBe('latent');
    expect(dodState.capabilities[0]?.structuralChecks.has_service).toBe(true);
  });

  it('does not classify a capability as real when required observed proof is not available', () => {
    const root = makeTempRoot();
    const pulseDir = path.join(root, '.pulse', 'current');
    const sourceDir = path.join(root, 'src', 'orders');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, 'orders.controller.ts'),
      [
        '@Controller("orders")',
        '@Injectable()',
        'class OrdersDto {}',
        'function useOrders() { useSWR("/orders"); }',
        'async function handler() {',
        '  logger.log("orders");',
        '  await fetch("/api/orders");',
        '  await prisma.order.findMany({ where: { workspaceId } });',
        '  try { return UseGuards(AuthGuard); } catch (error) { throw error; }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(sourceDir, 'orders.controller.spec.ts'),
      'describe("orders", () => { it("covers orders", () => { expect("orders").toContain("order"); }); });',
    );

    const capability: PulseCapability = {
      id: 'capability:orders-static-only',
      name: 'Orders static only',
      truthMode: 'observed',
      status: 'real',
      confidence: 0.9,
      userFacing: true,
      runtimeCritical: false,
      protectedByGovernance: false,
      ownerLane: 'customer',
      executionMode: 'ai_safe',
      rolesPresent: ['orchestration'],
      missingRoles: [],
      filePaths: ['src/orders/orders.controller.ts'],
      nodeIds: ['ui:orders', 'api:orders', 'service:orders', 'persistence:orders', 'route:orders'],
      routePatterns: ['/api/orders'],
      evidenceSources: ['structural_graph'],
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
          scenarioCoveragePresent: true,
          codacyHealthy: true,
          simulationOnly: false,
        },
        missing: ['runtime_evidence'],
      },
      dod: {
        status: 'partial',
        missingRoles: ['runtime_evidence'],
        blockers: [],
        truthModeMet: false,
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
        connectedCapabilities: 0,
        operationalCapabilities: 1,
        productionReadyCapabilities: 0,
        runtimeObservedCapabilities: 0,
        scenarioCoveredCapabilities: 1,
      },
      capabilities: [capability],
    };
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_CAPABILITY_STATE.json'),
      JSON.stringify(capabilityState, null, 2),
    );
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_SCENARIO_COVERAGE.json'),
      JSON.stringify({
        orders: { relatedCapabilities: ['capability:orders-static-only'] },
      }),
    );

    buildDoDEngineState(root);

    const dodState = JSON.parse(
      fs.readFileSync(path.join(pulseDir, 'PULSE_DOD_STATE.json'), 'utf8'),
    ) as DoDState;
    const entry = dodState.capabilities[0];
    expect(entry.classification).toBe('latent');
    expect(entry.requiredBeforeProduction).toContain(
      'Observed runtime proof for Orders static only',
    );
  });

  it('downgrades structurally real flows until observed governed proof exists', () => {
    const structuralGraph: PulseStructuralGraph = {
      generatedAt,
      summary: {
        totalNodes: 3,
        totalEdges: 2,
        roleCounts: {
          interface: 1,
          orchestration: 1,
          persistence: 1,
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
          id: 'ui:orders',
          kind: 'ui_element',
          role: 'interface',
          truthMode: 'observed',
          adapter: 'test',
          label: 'Orders',
          file: 'frontend/orders.tsx',
          line: 1,
          userFacing: true,
          runtimeCritical: true,
          protectedByGovernance: false,
          metadata: {},
        },
        {
          id: 'svc:orders',
          kind: 'service_trace',
          role: 'orchestration',
          truthMode: 'observed',
          adapter: 'test',
          label: 'Orders service',
          file: 'backend/orders.service.ts',
          line: 1,
          userFacing: true,
          runtimeCritical: true,
          protectedByGovernance: false,
          metadata: {},
        },
        {
          id: 'db:orders',
          kind: 'persistence_model',
          role: 'persistence',
          truthMode: 'observed',
          adapter: 'test',
          label: 'Order model',
          file: 'backend/orders.repository.ts',
          line: 1,
          userFacing: false,
          runtimeCritical: true,
          protectedByGovernance: false,
          metadata: {},
        },
      ],
      edges: [
        {
          id: 'edge:ui-svc',
          from: 'ui:orders',
          to: 'svc:orders',
          kind: 'calls',
          truthMode: 'observed',
          evidence: 'test',
        },
        {
          id: 'edge:svc-db',
          from: 'svc:orders',
          to: 'db:orders',
          kind: 'persists',
          truthMode: 'observed',
          evidence: 'test',
        },
      ],
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
        connectedCapabilities: 0,
        operationalCapabilities: 1,
        productionReadyCapabilities: 0,
        runtimeObservedCapabilities: 0,
        scenarioCoveredCapabilities: 0,
      },
      capabilities: [
        {
          id: 'capability:orders',
          name: 'Orders',
          truthMode: 'observed',
          status: 'real',
          confidence: 0.9,
          userFacing: true,
          runtimeCritical: true,
          protectedByGovernance: false,
          ownerLane: 'customer',
          executionMode: 'ai_safe',
          rolesPresent: ['interface', 'orchestration', 'persistence'],
          missingRoles: [],
          filePaths: ['frontend/orders.tsx', 'backend/orders.service.ts'],
          nodeIds: ['ui:orders', 'svc:orders', 'db:orders'],
          routePatterns: ['/api/orders'],
          evidenceSources: ['structural_graph'],
          codacyIssueCount: 0,
          highSeverityIssueCount: 0,
          blockingReasons: [],
          validationTargets: [],
          maturity: {
            stage: 'operational',
            score: 0.75,
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
            missing: ['runtime_evidence', 'scenario_coverage'],
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
    const codebaseTruth: PulseCodebaseTruth = {
      generatedAt,
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
          id: 'orders-flow',
          moduleKey: 'orders',
          moduleName: 'Orders',
          pageRoute: '/orders',
          elementLabel: 'Orders',
          httpMethod: 'POST',
          endpoint: '/api/orders',
          backendRoute: '/api/orders',
          connected: true,
          persistent: true,
          semanticTokens: ['orders'],
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

    const projection = buildFlowProjection({
      structuralGraph,
      capabilityState,
      codebaseTruth,
      resolvedManifest: { scenarioSpecs: [] } as PulseResolvedManifest,
    });
    const flow = projection.flows[0];

    expect(flow.status).toBe('partial');
    expect(flow.dod.status).toBe('partial');
    expect(flow.dod.governedBlockers?.length).toBeGreaterThan(0);
    expect(flow.dod.governedBlockers?.every((blocker) => blocker.executionMode === 'ai_safe')).toBe(
      true,
    );
    expect(flow.validationTargets.join('\n')).toContain('Governed ai_safe validation');
    expect(JSON.stringify(flow)).not.toMatch(/human_required|human approval/i);
  });
});

