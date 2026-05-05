import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  classifyTargetsFromSource,
  detectProviders,
  generateProviderScenarios,
} from '../../../chaos-engine';
import { isInternalEndpoint, providerFromUrl } from '../../../contract-tester';
import { filePathToCapability, filePathToFlow, isCriticalPath } from '../../../gitnexus/provider';
import { determineRiskLevel } from '../../../dod-engine';
import { ROUTE_NOISE_TOKENS } from '../../../codebase-truth.tokens';
import { isUserFacingGroup } from '../../../codebase-truth.string-utils';
import { isLikelyMutation } from '../../../codebase-truth-flows';
import { buildScenarioCatalog } from '../../../scenario-engine';
import { deriveUnitValue, deriveZeroValue } from '../../../dynamic-reality-kernel';
import type { PulseProductGraph } from '../../../types';

import { interactionChain, pulseCapability } from './helpers';

describe('PULSE no-hardcoded-reality contracts', () => {
  it('discovers contract providers from observed URL hosts instead of a provider catalog', () => {
    expect(providerFromUrl('https://api.opaque-provider.test/v1/events')).toBe(
      'api.opaque-provider.test',
    );
    expect(providerFromUrl('/api/internal/events')).toBeNull();
  });

  it('classifies chaos targets from dependency behavior instead of provider names', () => {
    expect([
      ...classifyTargetsFromSource('await opaqueNamedService.create({ amount: 100 })'),
    ]).toEqual([]);

    expect([
      ...classifyTargetsFromSource('await billingClient.post("/opaque", payload)'),
    ]).toContain('external_http');

    expect([
      ...classifyTargetsFromSource(
        '@Post("/opaque/webhook") handle(@Headers("x-signature") sig: string) {}',
      ),
    ]).toContain('webhook_receiver');
  });

  it('discovers chaos dependencies from code and artifacts without a provider catalog', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-chaos-deps-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    const pulseDir = path.join(rootDir, '.pulse/current');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(pulseDir, { recursive: true });

    const externalFile = path.join(backendDir, 'outbound.service.ts');
    fs.writeFileSync(
      externalFile,
      [
        'import { OpaqueClient } from "@vendor/opaque-sdk";',
        'export async function send() {',
        '  const endpoint = process.env.OPAQUE_ENDPOINT_URL;',
        '  return fetch("https://api.opaque-provider.test/v1/events");',
        '}',
      ].join('\n'),
    );

    const signalFile = path.join(backendDir, 'signal.service.ts');
    fs.writeFileSync(
      signalFile,
      'export async function probe() { return opaqueHttpClient.post("/events", {}); }',
    );

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_BEHAVIOR_GRAPH.json'),
      JSON.stringify({
        nodes: [
          {
            filePath: path.relative(rootDir, signalFile),
            externalCalls: [{ provider: 'observed-opaque-runtime' }],
          },
        ],
      }),
    );

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_STRUCTURAL_GRAPH.json'),
      JSON.stringify({
        nodes: [
          {
            kind: 'side_effect_signal',
            metadata: { filePath: path.relative(rootDir, signalFile) },
          },
        ],
      }),
    );

    const dependencies = detectProviders(rootDir);
    expect([...dependencies.keys()]).toEqual(
      expect.arrayContaining([
        'host:api-opaque-provider-test',
        'env:opaque-endpoint',
        'package:vendor-opaque-sdk',
        'behavior:observed-opaque-runtime',
        'client:opaquehttpclient',
      ]),
    );

    const scenarios = generateProviderScenarios(rootDir, dependencies, []);
    expect(
      scenarios.some((scenario) => scenario.id.includes('host:api-opaque-provider-test')),
    ).toBe(true);
    expect(scenarios.map((scenario) => scenario.description).join('\n')).not.toMatch(
      /stripe|openai|meta|resend/i,
    );
  });

  it('derives GitNexus impact labels structurally instead of a product domain catalog', () => {
    expect(filePathToCapability('backend/src/checkout/orders.controller.ts')).toBe('Checkout');
    expect(filePathToCapability('backend/src/xpto/orders.controller.ts')).toBe('Xpto');
    expect(filePathToFlow('backend/src/xpto/orders.controller.ts')).toBe('xpto-controller');

    expect(isCriticalPath('backend/src/payments/opaque.service.ts')).toBe(false);
    expect(isCriticalPath('backend/prisma/schema.prisma')).toBe(true);
    expect(isCriticalPath('backend/prisma/migrations/20260429120000_init/migration.sql')).toBe(
      true,
    );
  });

  it('classifies DoD risk from structural evidence instead of capability names', () => {
    expect(determineRiskLevel(pulseCapability({ name: 'Payment Wallet Checkout Auth' }))).toBe(
      'low',
    );

    expect(
      determineRiskLevel(
        pulseCapability({
          name: 'Xpto',
          rolesPresent: ['interface', 'persistence', 'side_effect'],
        }),
      ),
    ).toBe('critical');

    expect(
      determineRiskLevel(
        pulseCapability({
          name: 'Opaque',
          routePatterns: ['post-opaque-id'],
        }),
      ),
    ).toBe('high');
  });

  it('does not treat product route names as codebase-truth control tokens', () => {
    expect(ROUTE_NOISE_TOKENS.has('checkout')).toBe(false);
    expect(ROUTE_NOISE_TOKENS.has('auth')).toBe(false);
    expect(isUserFacingGroup('checkout')).toBe(false);
    expect(isUserFacingGroup('public')).toBe(true);
  });

  it('detects likely UI mutations from method and generic verbs instead of product words', () => {
    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Pay now',
          apiCall: { endpoint: '/checkout', method: 'GET', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(false);

    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Submit',
          apiCall: { endpoint: '/opaque', method: 'GET', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(true);

    expect(
      isLikelyMutation(
        interactionChain({
          elementLabel: 'Open',
          apiCall: { endpoint: '/opaque', method: 'POST', file: 'api.ts', line: 1 },
        }),
      ),
    ).toBe(true);
  });

  it('builds scenario catalog from arbitrary product graph surfaces instead of fixed domains', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scenario-dynamic-'));
    const pulseDir = path.join(rootDir, '.pulse', 'current');
    fs.mkdirSync(pulseDir, { recursive: true });

    const graph: PulseProductGraph = {
      surfaces: [
        {
          id: 'xpto',
          name: 'Xpto',
          description: 'Opaque discovered surface',
          artifactIds: [],
          capabilities: ['cap-xpto'],
          completeness: 0.5,
          truthMode: 'observed',
        },
      ],
      capabilities: [
        {
          id: 'cap-xpto',
          name: 'Opaque Capability',
          surfaceId: 'xpto',
          artifactIds: [],
          flowIds: ['flow-xpto'],
          maturityScore: 0.5,
          truthMode: 'observed',
          criticality: 'must_have',
          blockers: [],
        },
      ],
      flows: [
        {
          id: 'flow-xpto',
          name: 'Opaque Flow',
          entryCapability: 'cap-xpto',
          capabilities: ['cap-xpto'],
          completeness: 0.5,
          truthMode: 'observed',
          blockers: [],
        },
      ],
      orphanedArtifactIds: [],
      phantomCapabilities: [],
      latentCapabilities: [],
    };

    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_PRODUCT_GRAPH.json'),
      JSON.stringify(graph, null, 2),
    );
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_BEHAVIOR_GRAPH.json'),
      JSON.stringify({
        generatedAt: '2026-04-29T00:00:00.000Z',
        summary: {
          totalNodes: deriveUnitValue(),
          handlerNodes: deriveZeroValue(),
          apiEndpointNodes: deriveUnitValue(),
          queueNodes: deriveZeroValue(),
          cronNodes: deriveZeroValue(),
          webhookNodes: deriveZeroValue(),
          dbNodes: deriveZeroValue(),
          externalCallNodes: deriveZeroValue(),
          aiSafeNodes: deriveUnitValue(),
          humanRequiredNodes: deriveZeroValue(),
          nodesWithErrorHandler: deriveZeroValue(),
          nodesWithLogging: deriveZeroValue(),
          nodesWithMetrics: deriveZeroValue(),
          criticalRiskNodes: deriveZeroValue(),
        },
        nodes: [
          {
            id: 'node:xpto',
            kind: 'api_endpoint',
            name: 'XptoController.create',
            filePath: 'backend/src/xpto/xpto.controller.ts',
            line: 1,
            parentFunctionId: null,
            inputs: [
              {
                kind: 'body',
                name: 'opaqueField',
                type: 'string',
                required: true,
                validated: true,
                source: 'dto',
              },
            ],
            outputs: [{ kind: 'db_write', target: 'Opaque', type: 'create', conditional: false }],
            stateAccess: [],
            externalCalls: [],
            risk: 'medium',
            executionMode: 'ai_safe',
            calledBy: [],
            calls: [],
            isAsync: false,
            hasErrorHandler: false,
            hasLogging: false,
            hasMetrics: false,
            hasTracing: false,
            decorators: ['Post'],
            docComment: null,
          },
        ],
        orphanNodes: [],
        unreachableNodes: [],
      }),
    );

    const state = buildScenarioCatalog(rootDir);

    expect(state.scenarios).toHaveLength(1);
    expect(state.scenarios[0].id).toBe('flow-xpto');
    expect(state.scenarios[0].flowId).toBe('xpto/flow-xpto');
    expect(state.scenarios[0].role).toBe('anonymous');
    expect(state.scenarios[0].steps.map((step) => step.kind)).toContain('api_call');
    expect(state.scenarios[0].steps.some((step) => step.target.includes('opaqueField'))).toBe(true);
  });
});
