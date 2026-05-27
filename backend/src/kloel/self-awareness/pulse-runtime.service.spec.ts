import { Test, TestingModule } from '@nestjs/testing';
import { PulseRuntimeService, PulseHealthResult, BehaviorGraphNodeResult, RuntimeErrorsResult } from './pulse-runtime.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock the real PULSE_HEALTH.json shape
function makeHealthJson(overrides: Partial<any> = {}) {
  return JSON.stringify({
    score: 100,
    totalNodes: 1820,
    breaks: [
      {
        type: 'graph-route-caller-unobserved',
        severity: 'low',
        file: 'backend/src/payments/mercadopago/mercadopago-webhook.controller.ts',
        line: 48,
        description: 'POST /webhooks/mercadopago is not called by frontend code',
        detail: 'Controller: receive',
        source: 'graph:confirmed_static:route_caller_unobserved',
        surface: 'route-connectivity',
      },
      {
        type: 'graph-ui-handler-effect-unobserved',
        severity: 'medium',
        file: 'frontend/src/components/kloel/marketing/OfficialMarketingChannelPage/StepArsenal.tsx',
        line: 126,
        description: 'clickable "(sem texto)" has dead handler',
        detail: 'Handler: () => remove(index)',
        source: 'graph:confirmed_static:ui_handler_effect_unobserved',
        surface: 'ui-interaction',
      },
    ],
    stats: { uiElements: 1959, uiDeadHandlers: 1, apiCalls: 771 },
    timestamp: '2026-05-23T23:42:27.442Z',
    ...overrides,
  });
}

function makeBehaviorGraphJson(overrides: Partial<any> = {}) {
  return JSON.stringify({
    generatedAt: '2026-05-23T23:42:27.442Z',
    summary: { totalNodes: 100, aiSafeNodes: 80 },
    nodes: [
      {
        id: 'node-1',
        kind: 'handler',
        name: 'handleCheckout',
        filePath: 'backend/src/kloel/checkout.service.ts',
        line: 42,
        executionMode: 'ai_safe',
        risk: 'medium',
        isAsync: true,
        hasErrorHandler: true,
        hasLogging: true,
        calledBy: ['checkoutController'],
        calls: ['stripe.charge'],
      },
      {
        id: 'node-2',
        kind: 'api_endpoint',
        name: 'POST /api/checkout',
        filePath: 'backend/src/kloel/checkout.controller.ts',
        line: 15,
        executionMode: 'human_required',
        risk: 'critical',
        isAsync: true,
        hasErrorHandler: false,
        hasLogging: false,
        calledBy: [],
        calls: ['handleCheckout'],
      },
    ],
    orphanNodes: [],
    unreachableNodes: [],
    ...overrides,
  });
}

function makeRuntimeErrorsJson(errors: any[]) {
  return JSON.stringify({
    generatedAt: '2026-05-23T23:42:27.442Z',
    errors,
  });
}

describe('PulseRuntimeService', () => {
  let service: PulseRuntimeService;
  const repoRoot = path.resolve(process.cwd(), '..');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PulseRuntimeService],
    }).compile();
    service = module.get<PulseRuntimeService>(PulseRuntimeService);

    // Force fresh cache before each test by resetting internal state
    (service as any).cache.clear();
  });

  // ── pulse_health ──

  it('pulseHealth: returns available:false when PULSE_HEALTH.json is missing', async () => {
    const spy = jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('ENOENT'));

    const result = await service.pulseHealth();
    expect(result.success).toBe(true);
    expect(result.available).toBe(false);
    expect(result.hint).toContain('PULSE_HEALTH.json');

    spy.mockRestore();
  });

  it('pulseHealth: returns full health when artifact exists', async () => {
    const spy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(makeHealthJson());

    const result = await service.pulseHealth();
    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.score).toBe(100);
    expect(result.totalNodes).toBe(1820);
    expect(result.breaks).toHaveLength(2);
    expect(result.stats).toBeDefined();
    expect(result.timestamp).toBeDefined();

    spy.mockRestore();
  });

  it('pulseHealth: filters by module name', async () => {
    const spy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(makeHealthJson());

    const result = await service.pulseHealth('mercadopago');
    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.moduleName).toBe('mercadopago');
    expect(result.breaks).toHaveLength(1);
    expect(result.breaks![0]!.file).toContain('mercadopago');
    expect(result.breakCount).toBe(1);

    spy.mockRestore();
  });

  // ── behavior_graph_node ──

  it('behaviorGraphNode: returns available:false when graph is missing', async () => {
    const result = await service.behaviorGraphNode('handleCheckout');
    expect(result.success).toBe(true);
    expect(result.available).toBe(false);
    expect(result.hint).toContain('PULSE_BEHAVIOR_GRAPH.json');
  });

  it('behaviorGraphNode: finds node by name', async () => {
    const spy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(makeBehaviorGraphJson());

    const result = await service.behaviorGraphNode('handleCheckout');
    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.found).toBe(true);
    expect(result.node).toBeDefined();
    expect(result.node!.id).toBe('node-1');
    expect(result.node!.ai_safe).toBe(true);
    expect(result.node!.executionMode).toBe('ai_safe');

    spy.mockRestore();
  });

  it('behaviorGraphNode: returns found:false for unknown symbol', async () => {
    const spy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(makeBehaviorGraphJson());

    const result = await service.behaviorGraphNode('nonexistent');
    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.found).toBe(false);
    expect(result.hint).toContain('nonexistent');

    spy.mockRestore();
  });

  it('behaviorGraphNode: finds node by file path', async () => {
    const spy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(makeBehaviorGraphJson());

    const result = await service.behaviorGraphNode('checkout.controller');
    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.node!.name).toBe('POST /api/checkout');
    expect(result.node!.ai_safe).toBe(false);

    spy.mockRestore();
  });

  // ── runtime_errors ──

  it('runtimeErrors: returns available:false when no artifacts exist', async () => {
    const result = await service.runtimeErrors();
    expect(result.success).toBe(true);
    expect(result.available).toBe(false);
    expect(result.hint).toContain('runtime error');
  });

  it('runtimeErrors: returns top 10 from graphify-plus artifact', async () => {
    const errors = Array.from({ length: 15 }, (_, i) => ({
      culprit: `file${i}.ts`,
      symbol: `func${i}`,
      count: 100 - i,
      lastSeen: `2026-05-23T${String(i).padStart(2, '0')}:00:00.000Z`,
    }));
    const spy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(makeRuntimeErrorsJson(errors));

    const result = await service.runtimeErrors();
    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.errors).toHaveLength(10);
    expect(result.total).toBe(10);
    expect(result.errors![0]!.count).toBe(100);

    spy.mockRestore();
  });

  // ── cache ──

  it('caches reads within TTL window', async () => {
    const spy = jest.spyOn(fs, 'readFile').mockResolvedValueOnce(makeHealthJson());

    // First call reads from disk
    const r1 = await service.pulseHealth();
    expect(r1.available).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Second call within 60s TTL returns from cache
    const r2 = await service.pulseHealth();
    expect(r2.available).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1); // still 1, no second read

    spy.mockRestore();
  });
});
