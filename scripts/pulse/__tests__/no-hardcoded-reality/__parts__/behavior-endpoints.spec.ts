import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyEndpointRisk } from '../../api-fuzzer';
import { buildBehaviorGraph } from '../../behavior-graph';
import {
  classifyTargetsFromSource,
  detectProviders,
  generateProviderScenarios,
} from '../../chaos-engine';
import { isInternalEndpoint, providerFromUrl } from '../../contract-tester';
import { determineRiskLevel } from '../../dod-engine';
import { buildSideEffectSignals } from '../../structural-side-effects';
import { filePathToCapability, filePathToFlow, isCriticalPath } from '../../gitnexus/provider';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverCapabilityMaturityStageLabels,
  discoverCapabilityStatusLabels,
  discoverConvergenceExecutionModeLabels,
  discoverDoDStatusLabels,
} from '../../dynamic-reality-kernel';
import type { PulseCapability } from '../../types';

function pulseCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  const capabilityStatuses = [...discoverCapabilityStatusLabels()];
  const maturityStages = [...discoverCapabilityMaturityStageLabels()];
  const dodStatuses = [...discoverDoDStatusLabels()];
  const executionModes = [...discoverConvergenceExecutionModeLabels()];
  return {
    id: 'capability:opaque',
    name: 'Opaque',
    truthMode: 'observed',
    status: capabilityStatuses[0] as PulseCapability['status'],
    confidence: deriveUnitValue(),
    userFacing: false,
    runtimeCritical: false,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: executionModes[0] as PulseCapability['executionMode'],
    rolesPresent: [],
    missingRoles: [],
    filePaths: [],
    nodeIds: [],
    routePatterns: [],
    evidenceSources: [],
    codacyIssueCount: deriveZeroValue(),
    highSeverityIssueCount: deriveZeroValue(),
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: maturityStages[0] as PulseCapability['maturity']['stage'],
      score: deriveZeroValue(),
      dimensions: {
        interfacePresent: false,
        apiSurfacePresent: false,
        orchestrationPresent: false,
        persistencePresent: false,
        sideEffectPresent: false,
        runtimeEvidencePresent: false,
        validationPresent: false,
        scenarioCoveragePresent: false,
        codacyHealthy: true,
        simulationOnly: false,
      },
      missing: [],
    },
    dod: {
      status: dodStatuses[0] as PulseCapability['dod']['status'],
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

describe('PULSE no-hardcoded-reality contracts', () => {
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
});
