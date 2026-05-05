import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyReplaySession } from '../../../replay-adapter';
import { classifyDestructiveActions } from '../../../safety-sandbox';
import { detectNewFile } from '../../../scope-engine';
import { classifyRoleFromRoute } from '../../../ui-crawler';
import { classifyExecutionFeasibility, isCriticalHarnessTarget } from '../../../execution-harness';
import { buildBehaviorGraph } from '../../../behavior-graph';
import { buildSideEffectSignals } from '../../../structural-side-effects';
import { isInternalEndpoint } from '../../../contract-tester';

import { harnessTarget, replaySession } from './helpers';

describe('PULSE no-hardcoded-reality contracts', () => {
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
});
