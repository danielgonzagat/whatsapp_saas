import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildDoDEngineState } from '../dod-engine';
import type { DoDState } from '../types.dod-engine';
import type { PulseCapability, PulseCapabilityState } from '../types';

import { cleanupTempRoots, generatedAt, makeTempRoot } from './__parts__/dod-real-status.helpers';
import './__parts__/dod-real-status.cases.flows';

afterEach(cleanupTempRoots);

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
});
