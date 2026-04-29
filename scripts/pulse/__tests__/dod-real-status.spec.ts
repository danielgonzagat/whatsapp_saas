import { describe, expect, it } from 'vitest';

import { buildFlowProjection } from '../flow-projection';
import type {
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseResolvedManifest,
  PulseStructuralGraph,
} from '../types';

const generatedAt = '2026-04-29T00:00:00.000Z';

describe('DoD real-status guardrails', () => {
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
