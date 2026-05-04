import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyDestructiveActions } from '../../safety-sandbox';
import { detectNewFile } from '../../scope-engine';
import { classifyRoleFromRoute } from '../../ui-crawler';
import { isCriticalHarnessTarget, classifyExecutionFeasibility } from '../../execution-harness';
import { buildBehaviorGraph } from '../../behavior-graph';
import { buildSideEffectSignals } from '../../structural-side-effects';
import { isInternalEndpoint, providerFromUrl } from '../../contract-tester';
import {
  classifyTargetsFromSource,
  detectProviders,
  generateProviderScenarios,
} from '../../chaos-engine';
import { filePathToCapability, filePathToFlow, isCriticalPath } from '../../gitnexus/provider';
import { determineRiskLevel } from '../../dod-engine';
import { ROUTE_NOISE_TOKENS } from '../../codebase-truth.tokens';
import { isUserFacingGroup } from '../../codebase-truth.string-utils';
import { isLikelyMutation } from '../../codebase-truth-flows';
import { buildScenarioCatalog } from '../../scenario-engine';
import type { PulseConfig, PulseProductGraph } from '../../types';
import { harnessTarget, pulseCapability, interactionChain } from './no-hardcoded-reality.helpers';

describe('PULSE no-hardcoded-reality contracts — dynamic', () => {
  it('does not assign crawler roles from product route names', () => {
    expect(classifyRoleFromRoute('/checkout')).toBe('customer');
    expect(classifyRoleFromRoute('/payments')).toBe('customer');
    expect(classifyRoleFromRoute('/admin')).toBe('admin');
    expect(classifyRoleFromRoute('/operator/queue')).toBe('operator');
  });

  it('does not mark product-named source paths as protected governance', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scope-'));
    const governanceDir = path.join(rootDir, 'ops');
    fs.mkdirSync(governanceDir, { recursive: true });
    fs.writeFileSync(
      path.join(governanceDir, 'protected-governance-files.json'),
      JSON.stringify({
        protectedExact: [],
        protectedPrefixes: ['scripts/ops/'],
      }),
    );
    const productNamedDir = path.join(rootDir, 'backend/src/auth');
    fs.mkdirSync(productNamedDir, { recursive: true });
    const productNamedFile = path.join(productNamedDir, 'opaque.ts');
    fs.writeFileSync(productNamedFile, 'export function opaque() { return true; }');

    const protectedDir = path.join(rootDir, 'scripts/ops');
    fs.mkdirSync(protectedDir, { recursive: true });
    const protectedFile = path.join(protectedDir, 'guard.mjs');
    fs.writeFileSync(protectedFile, 'export default true;');

    expect(detectNewFile(rootDir, productNamedFile)?.isProtected).toBe(false);
    expect(detectNewFile(rootDir, productNamedFile)?.executionMode).toBe('ai_safe');
    expect(detectNewFile(rootDir, protectedFile)?.isProtected).toBe(true);
    expect(detectNewFile(rootDir, protectedFile)?.executionMode).toBe('human_required');
  });

  it('does not classify sandbox destructive actions from product path names alone', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-sandbox-'));
    const productNamedDir = path.join(rootDir, 'backend/src/payments');
    fs.mkdirSync(productNamedDir, { recursive: true });
    fs.writeFileSync(path.join(productNamedDir, 'opaque.ts'), 'export const opaque = true;');

    const mutatingDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(mutatingDir, { recursive: true });
    fs.writeFileSync(
      path.join(mutatingDir, 'mutating.ts'),
      'export async function run(client: { post(input: string): Promise<void> }) { await client.post("/opaque"); }',
    );

    const actions = classifyDestructiveActions(rootDir);

    expect(actions.some((action) => action.targetFile?.endsWith('payments/opaque.ts'))).toBe(false);
    expect(actions.some((action) => action.kind === 'external_state_mutation')).toBe(true);
  });

  it('classifies harness criticality from execution shape instead of target names', () => {
    expect(
      isCriticalHarnessTarget(
        harnessTarget({
          targetId: 'endpoint:get:payment',
          name: 'PaymentController.index',
          routePattern: '/payment',
        }),
      ),
    ).toBe(false);

    expect(
      isCriticalHarnessTarget(
        harnessTarget({
          targetId: 'endpoint:post:opaque',
          name: 'OpaqueController.create',
          routePattern: '/opaque',
          httpMethod: 'POST',
        }),
      ),
    ).toBe(true);
  });

  it('classifies harness staging from executable source shape instead of provider names', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-harness-shape-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    const namedOnlyFile = path.join(backendDir, 'opaque-label.service.ts');
    fs.writeFileSync(namedOnlyFile, 'export class OpaqueLabel { run() { return true; } }');

    const outboundFile = path.join(backendDir, 'outbound.service.ts');
    fs.writeFileSync(
      outboundFile,
      'export class Outbound { async run() { return fetch("https://example.test/probe"); } }',
    );

    expect(
      classifyExecutionFeasibility(
        harnessTarget({
          kind: 'service',
          name: 'OpaqueLabel.run',
          filePath: path.relative(rootDir, namedOnlyFile),
          methodName: 'run',
        }),
        new Map(),
        rootDir,
      ).feasibility,
    ).toBe('executable');

    expect(
      classifyExecutionFeasibility(
        harnessTarget({
          kind: 'service',
          name: 'Opaque.run',
          filePath: path.relative(rootDir, outboundFile),
          methodName: 'run',
        }),
        new Map(),
        rootDir,
      ).feasibility,
    ).toBe('needs_staging');
  });

  it('builds behavior graph external calls from import and call shape instead of provider catalogs', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-behavior-dynamic-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'provider-name-only.service.ts'),
      ['export class StripeOpenAiWhatsappLabel {', '  run() { return true; }', '}'].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'dynamic-external.service.ts'),
      [
        "import OpaqueClient from 'opaque-sdk';",
        'export class DynamicExternalService {',
        '  async run() { return OpaqueClient.create({ amountCents: 100, currency: "USD" }); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'dynamic-payment-chain.service.ts'),
      [
        "import OpaqueClient from 'opaque-sdk';",
        'export class DynamicPaymentChainService {',
        '  async run() { return OpaqueClient.checkout.sessions.create({ total: 100 }); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'semantic-payment-action.service.ts'),
      [
        'export class SemanticPaymentActionService {',
        '  async run() { return processPayment({ amountCents: 100, currency: "USD" }); }',
        '}',
      ].join('\n'),
    );

    const graph = buildBehaviorGraph(rootDir);
    const namedOnly = graph.nodes.find((node) =>
      node.filePath.endsWith('provider-name-only.service.ts'),
    );
    const dynamicExternal = graph.nodes.find((node) =>
      node.filePath.endsWith('dynamic-external.service.ts'),
    );
    const dynamicPaymentChain = graph.nodes.find((node) =>
      node.filePath.endsWith('dynamic-payment-chain.service.ts'),
    );
    const semanticPaymentAction = graph.nodes.find((node) =>
      node.filePath.endsWith('semantic-payment-action.service.ts'),
    );

    expect(namedOnly?.externalCalls).toEqual([]);
    expect(namedOnly?.risk).toBe('low');
    expect(dynamicExternal?.externalCalls.map((call) => call.provider)).toEqual(['OpaqueClient']);
    expect(dynamicExternal?.risk).toBe('high');
    expect(dynamicPaymentChain?.externalCalls).toEqual([
      expect.objectContaining({ provider: 'OpaqueClient', operation: 'create' }),
    ]);
    expect(dynamicPaymentChain?.risk).toBe('high');
    expect(semanticPaymentAction?.externalCalls).toEqual([]);
    expect(semanticPaymentAction?.risk).toBe('high');
  });

  it('builds structural side effects from arbitrary external SDK usage instead of fixed SDK names', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-side-effect-dynamic-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'named-only.ts'),
      'export const stripeOpenAiWhatsapp = "label-only";',
    );
    fs.writeFileSync(
      path.join(backendDir, 'external-sdk.ts'),
      [
        "import OpaqueProvider from 'opaque-provider-sdk';",
        'export async function run() {',
        '  return OpaqueProvider.send({ ok: true });',
        '}',
      ].join('\n'),
    );

    const nodes = buildSideEffectSignals(
      rootDir,
      ['backend/src/opaque/named-only.ts', 'backend/src/opaque/external-sdk.ts'],
      new Map(),
      'observed',
    );

    expect(
      nodes.some(
        (node) =>
          node.file?.endsWith('named-only.ts') && node.metadata.signal === 'external_sdk_call',
      ),
    ).toBe(false);
    expect(
      nodes.some(
        (node) =>
          node.file?.endsWith('external-sdk.ts') && node.metadata.signal === 'external_sdk_call',
      ),
    ).toBe(true);
  });

  it('classifies internal endpoints by URL structure instead of known product prefixes', () => {
    expect(isInternalEndpoint('/xpto')).toBe(true);
    expect(isInternalEndpoint('/payment')).toBe(true);
    expect(isInternalEndpoint('https://api.example.test/payment')).toBe(false);
  });

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
          totalNodes: 1,
          handlerNodes: 0,
          apiEndpointNodes: 1,
          queueNodes: 0,
          cronNodes: 0,
          webhookNodes: 0,
          dbNodes: 0,
          externalCallNodes: 0,
          aiSafeNodes: 1,
          humanRequiredNodes: 0,
          nodesWithErrorHandler: 0,
          nodesWithLogging: 0,
          nodesWithMetrics: 0,
          criticalRiskNodes: 0,
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
