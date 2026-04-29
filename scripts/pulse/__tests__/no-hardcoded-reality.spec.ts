import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyEndpointRisk } from '../api-fuzzer';
import { classifyTargetsFromSource } from '../chaos-engine';
import { isInternalEndpoint, providerFromUrl } from '../contract-tester';
import { classifyFinancialModel } from '../dataflow-engine';
import { isSafeToExecute } from '../path-coverage-engine';
import { discoverPlugins } from '../plugin-system';
import { classifyEndpointRisk as classifyPropertyEndpointRisk } from '../property-tester';
import { classifyReplaySession } from '../replay-adapter';
import { classifyDestructiveActions } from '../safety-sandbox';
import { detectNewFile } from '../scope-engine';
import { classifyRoleFromRoute } from '../ui-crawler';
import { determineRiskLevel } from '../dod-engine';
import { isCriticalHarnessTarget } from '../execution-harness';
import { filePathToCapability, filePathToFlow, isCriticalPath } from '../gitnexus/provider';
import { ROUTE_NOISE_TOKENS } from '../codebase-truth.tokens';
import { isUserFacingGroup } from '../codebase-truth.string-utils';
import { isLikelyMutation } from '../codebase-truth-flows';
import type { APIEndpointProbe } from '../types.api-fuzzer';
import type { HarnessTarget } from '../types.execution-harness';
import type { PulseExecutionMatrixPath } from '../types.execution-matrix';
import type { PulseCapability } from '../types';
import type { ReplaySession } from '../types.replay-adapter';
import type { InteractionChain } from '../functional-map-types';

function endpointProbe(overrides: Partial<APIEndpointProbe> = {}): APIEndpointProbe {
  return {
    endpointId: 'GET:/anything:index:test.ts:1',
    method: 'GET',
    path: '/anything',
    controller: 'TestController',
    filePath: 'backend/src/renamed/test.controller.ts',
    requiresAuth: false,
    requiresTenant: false,
    rateLimit: null,
    requestSchema: null,
    responseSchema: null,
    authTests: [],
    schemaTests: [],
    idempotencyTests: [],
    rateLimitTests: [],
    securityTests: [],
    ...overrides,
  };
}

function matrixPath(overrides: Partial<PulseExecutionMatrixPath> = {}): PulseExecutionMatrixPath {
  return {
    pathId: 'matrix:path:test',
    capabilityId: null,
    flowId: null,
    source: 'execution_chain',
    entrypoint: {
      nodeId: null,
      filePath: 'backend/src/opaque/controller.ts',
      routePattern: '/opaque',
      description: 'Opaque route',
    },
    chain: [],
    status: 'inferred_only',
    truthMode: 'inferred',
    productStatus: null,
    breakpoint: null,
    requiredEvidence: [],
    observedEvidence: [],
    validationCommand: 'node scripts/pulse/run.js --guidance',
    risk: 'medium',
    executionMode: 'ai_safe',
    confidence: 1,
    filePaths: ['backend/src/opaque/controller.ts'],
    routePatterns: ['/opaque'],
    ...overrides,
  };
}

function replaySession(overrides: Partial<ReplaySession> = {}): ReplaySession {
  return {
    sessionId: 'replay-1',
    source: 'sentry_replay',
    userId: null,
    startTime: '2026-04-29T00:00:00.000Z',
    endTime: '2026-04-29T00:00:01.000Z',
    durationMs: 1000,
    url: '/opaque',
    events: [],
    errors: [{ message: 'failed', timestamp: '2026-04-29T00:00:01.000Z' }],
    status: 'captured',
    convertedScenarioId: null,
    ...overrides,
  };
}

function harnessTarget(overrides: Partial<HarnessTarget> = {}): HarnessTarget {
  return {
    targetId: 'endpoint:get:opaque',
    kind: 'endpoint',
    name: 'OpaqueController.index',
    filePath: 'backend/src/opaque/controller.ts',
    methodName: 'index',
    routePattern: '/opaque',
    httpMethod: 'GET',
    requiresAuth: false,
    requiresTenant: false,
    dependencies: [],
    fixtures: [],
    feasibility: 'executable',
    feasibilityReason: '',
    generatedTests: [],
    generated: false,
    ...overrides,
  };
}

function pulseCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  return {
    id: 'capability:opaque',
    name: 'Opaque',
    truthMode: 'observed',
    status: 'partial',
    confidence: 1,
    userFacing: false,
    runtimeCritical: false,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: 'ai_safe',
    rolesPresent: [],
    missingRoles: [],
    filePaths: [],
    nodeIds: [],
    routePatterns: [],
    evidenceSources: [],
    codacyIssueCount: 0,
    highSeverityIssueCount: 0,
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: 'foundational',
      score: 0,
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
      status: 'partial',
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

function interactionChain(overrides: Partial<InteractionChain> = {}): InteractionChain {
  return {
    pageRoute: '/opaque',
    pageFile: 'frontend/src/app/opaque/page.tsx',
    componentFile: 'frontend/src/components/Opaque.tsx',
    elementType: 'button',
    elementLabel: 'Open',
    elementLine: 1,
    handler: null,
    handlerType: 'unknown',
    apiCall: {
      endpoint: '/opaque',
      method: 'GET',
      file: 'frontend/src/lib/api.ts',
      line: 1,
    },
    proxyRoute: null,
    backendRoute: null,
    serviceMethod: null,
    prismaModels: [],
    status: 'FUNCIONA',
    statusReason: '',
    facadeEvidence: [],
    ...overrides,
  };
}

describe('PULSE no-hardcoded-reality contracts', () => {
  it('does not seed built-in product domain packs from the core', () => {
    const plugins = discoverPlugins(path.join(process.cwd(), '__pulse_no_plugins__'));

    expect(plugins).toEqual([]);
  });

  it('does not classify a model as financial from name alone', () => {
    expect(classifyFinancialModel('Payment', ['id', 'createdAt', 'updatedAt'])).toBe(false);
  });

  it('classifies money-like state from fields even when the model name is opaque', () => {
    expect(classifyFinancialModel('Xpto', ['id', 'amountCents', 'currency', 'status'])).toBe(true);
  });

  it('classifies API risk from contract shape instead of product path words', () => {
    expect(
      classifyEndpointRisk(
        endpointProbe({ path: '/checkout', filePath: 'backend/src/payment.ts' }),
      ),
    ).toBe('low');

    expect(
      classifyEndpointRisk(
        endpointProbe({
          method: 'POST',
          path: '/xpto',
          filePath: 'backend/src/opaque/controller.ts',
          requiresAuth: false,
          requestSchema: { dtoType: 'CreateOpaqueDto', source: 'inferred' },
        }),
      ),
    ).toBe('critical');
  });

  it('classifies property fuzz endpoint risk from request shape instead of product words', () => {
    expect(
      classifyPropertyEndpointRisk({ method: 'GET', path: '/payment', filePath: 'opaque.ts' }),
    ).toBe('low');
    expect(
      classifyPropertyEndpointRisk({ method: 'DELETE', path: '/xpto/:id', filePath: 'opaque.ts' }),
    ).toBe('high');
  });

  it('classifies path execution safety from matrix risk instead of path words', () => {
    expect(
      isSafeToExecute(
        matrixPath({ filePaths: ['backend/src/checkout/payment.controller.ts'], risk: 'medium' }),
      ),
    ).toBe(true);

    expect(
      isSafeToExecute(
        matrixPath({ filePaths: ['backend/src/opaque/controller.ts'], risk: 'high' }),
      ),
    ).toBe(false);
  });

  it('promotes replay sessions from observed impact instead of URL words', () => {
    expect(classifyReplaySession(replaySession({ url: '/checkout' }))).toBe('temporary');

    expect(
      classifyReplaySession(
        replaySession({
          url: '/opaque',
          events: [
            {
              type: 'error',
              timestamp: '2026-04-29T00:00:01.000Z',
              detail: { severity: 9 },
            },
          ],
        }),
      ),
    ).toBe('permanent');
  });

  it('does not assign crawler roles from product route names', () => {
    expect(classifyRoleFromRoute('/checkout')).toBe('customer');
    expect(classifyRoleFromRoute('/payments')).toBe('customer');
    expect(classifyRoleFromRoute('/admin')).toBe('admin');
    expect(classifyRoleFromRoute('/operator/queue')).toBe('operator');
  });

  it('does not mark product-named source paths as protected governance', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scope-'));
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
    expect([...classifyTargetsFromSource('await stripe.create({ amount: 100 })')]).toEqual([]);

    expect([
      ...classifyTargetsFromSource('await billingClient.post("/opaque", payload)'),
    ]).toContain('external_http');

    expect([
      ...classifyTargetsFromSource(
        '@Post("/opaque/webhook") handle(@Headers("x-signature") sig: string) {}',
      ),
    ]).toContain('webhook_receiver');
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
});
