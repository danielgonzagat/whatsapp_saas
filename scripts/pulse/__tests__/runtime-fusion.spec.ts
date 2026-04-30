import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRuntimeFusionState } from '../runtime-fusion';
import type { RuntimeFusionState } from '../types.runtime-fusion';

let tempRoots: string[] = [];

function createPulseRoot(): { rootDir: string; currentDir: string } {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-runtime-fusion-'));
  const currentDir = path.join(rootDir, '.pulse', 'current');
  mkdirSync(currentDir, { recursive: true });
  tempRoots.push(rootDir);
  return { rootDir, currentDir };
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readFusion(currentDir: string): RuntimeFusionState {
  return JSON.parse(readFileSync(path.join(currentDir, 'PULSE_RUNTIME_FUSION.json'), 'utf8'));
}

afterEach(() => {
  for (const rootDir of tempRoots) {
    rmSync(rootDir, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe('runtime-fusion', () => {
  it('loads canonical external signals and does not promote simulated traces to runtime evidence', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'), {
      generatedAt: '2026-04-29T19:06:52.792Z',
      truthMode: 'observed',
      summary: { totalSignals: 2 },
      adapters: [
        { source: 'sentry', status: 'ready' },
        { source: 'prometheus', status: 'optional_not_configured' },
        { source: 'datadog', status: 'not_available' },
      ],
      signals: [
        {
          id: 'sentry:runtime-error',
          type: 'runtime_error',
          source: 'sentry',
          truthMode: 'observed',
          severity: 0.95,
          impactScore: 0.9,
          summary: 'Observed Sentry runtime error.',
          observedAt: '2026-04-29T19:00:00.000Z',
          relatedFiles: ['backend/src/auth/email.service.ts'],
          capabilityIds: ['capability:auth'],
          flowIds: ['auth-post-auth-login'],
        },
        {
          id: 'codacy:hotspot',
          type: 'static_hotspot',
          source: 'codacy',
          truthMode: 'observed',
          severity: 0.75,
          impactScore: 0.8,
          summary: 'Observed Codacy hotspot.',
          observedAt: '2026-04-29T19:01:00.000Z',
          relatedFiles: ['backend/src/auth/email.service.ts'],
          capabilityIds: ['capability:auth'],
          flowIds: [],
        },
      ],
    });
    writeJson(path.join(currentDir, 'PULSE_RUNTIME_TRACES.json'), {
      generatedAt: '2026-04-29T19:05:31.150Z',
      source: 'simulated',
      summary: {
        totalTraces: 14,
        totalSpans: 45,
        errorTraces: 5,
        endpointMap: {},
        avgDurationMs: 154,
        p95DurationMs: 203,
      },
      traces: [],
      spanToPathMappings: [],
    });

    const state = buildRuntimeFusionState(rootDir);
    const written = readFusion(currentDir);

    expect(state.summary.totalSignals).toBe(2);
    expect(written.summary.totalSignals).toBe(2);
    expect(state.summary.sourceCounts.sentry).toBe(1);
    expect(state.summary.sourceCounts.codacy).toBe(1);
    expect(state.summary.sourceCounts.otel_runtime).toBe(0);
    expect(state.evidence.runtimeTraces.status).toBe('simulated');
    expect(state.evidence.runtimeTraces.derivedSignals).toBe(0);
    expect(state.evidence.externalSignalState.notAvailableAdapters).toEqual(['datadog']);
    expect(state.evidence.externalSignalState.skippedAdapters).toEqual(['prometheus']);
    expect(state.signals.every((signal) => signal.source !== 'otel_runtime')).toBe(true);
  });

  it('derives otel_runtime signals only from observed runtime trace sources', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'), {
      generatedAt: '2026-04-29T19:06:52.792Z',
      truthMode: 'observed',
      summary: { totalSignals: 0 },
      adapters: [],
      signals: [],
    });
    writeJson(path.join(currentDir, 'PULSE_RUNTIME_TRACES.json'), {
      generatedAt: '2026-04-29T19:05:31.150Z',
      source: 'otel_collector',
      summary: {
        totalTraces: 1,
        totalSpans: 1,
        errorTraces: 1,
        endpointMap: {},
        avgDurationMs: 100,
        p95DurationMs: 100,
      },
      traces: [
        {
          traceId: 'trace-1',
          rootSpan: {
            spanId: 'span-1',
            parentSpanId: null,
            traceId: 'trace-1',
            name: 'POST /api/auth/login',
            kind: 'server',
            serviceName: 'backend',
            attributes: {
              'http.method': 'POST',
              'http.route': '/api/auth/login',
              'http.status_code': 500,
            },
            startTime: '2026-04-29T19:05:31.000Z',
            endTime: '2026-04-29T19:05:31.100Z',
            durationMs: 100,
            status: 'error',
            statusMessage: 'Internal server error',
            events: [],
          },
          spans: [
            {
              spanId: 'span-1',
              parentSpanId: null,
              traceId: 'trace-1',
              name: 'POST /api/auth/login',
              kind: 'server',
              serviceName: 'backend',
              attributes: {
                'http.method': 'POST',
                'http.route': '/api/auth/login',
                'http.status_code': 500,
              },
              startTime: '2026-04-29T19:05:31.000Z',
              endTime: '2026-04-29T19:05:31.100Z',
              durationMs: 100,
              status: 'error',
              statusMessage: 'Internal server error',
              events: [],
            },
          ],
          totalDurationMs: 100,
          errorSpans: 1,
          serviceBoundaries: 0,
        },
      ],
      spanToPathMappings: [],
    });

    const state = buildRuntimeFusionState(rootDir);

    expect(state.summary.totalSignals).toBe(1);
    expect(state.summary.sourceCounts.otel_runtime).toBe(1);
    expect(state.evidence.runtimeTraces.status).toBe('observed');
    expect(state.evidence.runtimeTraces.derivedSignals).toBe(1);
    expect(state.signals[0]?.evidenceMode).toBe('observed');
  });

  it('emits machine improvement signals when runtime proof sources are not available', () => {
    const { rootDir } = createPulseRoot();

    const state = buildRuntimeFusionState(rootDir);

    expect(state.evidence.externalSignalState.status).toBe('not_available');
    expect(state.evidence.runtimeTraces.status).toBe('not_available');
    expect(state.machineImprovementSignals).toEqual([
      expect.objectContaining({
        targetEngine: 'external-sources-orchestrator',
        missingEvidence: 'external_signal',
        truthMode: 'not_available',
        productEditRequired: false,
      }),
      expect.objectContaining({
        targetEngine: 'otel-runtime',
        missingEvidence: 'runtime_trace',
        truthMode: 'not_available',
        productEditRequired: false,
      }),
    ]);
    expect(
      state.machineImprovementSignals.every((signal) =>
        signal.recommendedPulseAction.toLowerCase().includes('pulse'),
      ),
    ).toBe(true);
  });

  it('keeps scan-mode runtime traces actionable without promoting them to observed proof', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_RUNTIME_TRACES.json'), {
      generatedAt: '2026-04-29T19:05:31.150Z',
      source: 'scan',
      summary: {
        totalTraces: 0,
        totalSpans: 0,
        errorTraces: 0,
      },
      traces: [],
      spanToPathMappings: [],
    });

    const state = buildRuntimeFusionState(rootDir);
    const runtimeTraceSignal = state.machineImprovementSignals.find(
      (signal) => signal.missingEvidence === 'runtime_trace',
    );

    expect(state.evidence.runtimeTraces.status).toBe('skipped');
    expect(runtimeTraceSignal).toEqual(
      expect.objectContaining({
        targetEngine: 'otel-runtime',
        truthMode: 'inferred',
        sourceStatus: 'skipped',
        productEditRequired: false,
      }),
    );
    expect(state.signals.some((signal) => signal.source === 'otel_runtime')).toBe(false);
  });

  it('maps manual OTel error spans to capabilities through span-to-path evidence', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_CAPABILITY_STATE.json'), {
      capabilities: [
        {
          id: 'capability:auth-runtime',
          name: 'Auth runtime',
          filePaths: ['backend/src/auth/auth.service.ts'],
        },
      ],
    });
    writeJson(path.join(currentDir, 'PULSE_FLOW_PROJECTION.json'), {
      flows: [
        {
          id: 'flow:auth-login',
          name: 'Auth login',
          capabilityIds: ['capability:auth-runtime'],
          routePatterns: ['/api/auth/login'],
        },
      ],
    });
    writeJson(path.join(currentDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'), {
      generatedAt: '2026-04-29T19:06:52.792Z',
      truthMode: 'observed',
      adapters: [],
      signals: [],
    });
    writeJson(path.join(currentDir, 'PULSE_RUNTIME_TRACES.json'), {
      generatedAt: '2026-04-29T19:05:31.150Z',
      source: 'manual',
      sourceDetails: {
        kind: 'manual_tracer',
        runtimeObserved: true,
        deterministic: false,
        reason: null,
      },
      summary: {
        totalTraces: 1,
        totalSpans: 1,
        errorTraces: 1,
        endpointMap: {},
        avgDurationMs: 100,
        p95DurationMs: 100,
      },
      traces: [
        {
          traceId: 'trace-manual',
          rootSpan: {
            spanId: 'span-manual',
            parentSpanId: null,
            traceId: 'trace-manual',
            name: 'POST /api/auth/login',
            kind: 'server',
            serviceName: 'backend',
            attributes: {
              'http.method': 'POST',
              'http.route': '/api/auth/login',
              'http.status_code': 500,
              'pulse.structural.from': 'route:auth-login',
              'pulse.structural.to': 'service:auth',
            },
            startTime: '2026-04-29T19:05:31.000Z',
            endTime: '2026-04-29T19:05:31.100Z',
            durationMs: 100,
            status: 'error',
            statusMessage: 'Internal server error',
            events: [],
          },
          spans: [
            {
              spanId: 'span-manual',
              parentSpanId: null,
              traceId: 'trace-manual',
              name: 'POST /api/auth/login',
              kind: 'server',
              serviceName: 'backend',
              attributes: {
                'http.method': 'POST',
                'http.route': '/api/auth/login',
                'http.status_code': 500,
                'pulse.structural.from': 'route:auth-login',
                'pulse.structural.to': 'service:auth',
              },
              startTime: '2026-04-29T19:05:31.000Z',
              endTime: '2026-04-29T19:05:31.100Z',
              durationMs: 100,
              status: 'error',
              statusMessage: 'Internal server error',
              events: [],
            },
          ],
          totalDurationMs: 100,
          errorSpans: 1,
          serviceBoundaries: 0,
        },
      ],
      spanToPathMappings: [
        {
          spanName: 'POST /api/auth/login',
          matchedNodeIds: ['route:auth-login', 'service:auth'],
          matchedFilePaths: ['backend/src/auth/auth.service.ts'],
          confidence: 0.9,
        },
      ],
    });

    const state = buildRuntimeFusionState(rootDir);
    const signal = state.signals.find((candidate) => candidate.source === 'otel_runtime');

    expect(state.evidence.runtimeTraces.status).toBe('observed');
    expect(state.evidence.runtimeTraces.source).toBe('manual');
    expect(signal?.affectedFilePaths).toEqual(['backend/src/auth/auth.service.ts']);
    expect(signal?.affectedCapabilityIds).toEqual(['capability:auth-runtime']);
    expect(signal?.affectedFlowIds).toEqual(['flow:auth-login']);
    expect(state.priorityOverrides).toEqual([
      expect.objectContaining({
        capabilityId: 'capability:auth-runtime',
        newPriority: 'P0',
      }),
    ]);
  });

  it('derives dynamic signal semantics from payload, source capability, trend, and blast radius', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_CAPABILITY_STATE.json'), {
      capabilities: [
        {
          id: 'capability:opaque-runtime',
          name: 'Opaque runtime processor',
          filePaths: ['backend/src/opaque/runtime.service.ts'],
        },
      ],
    });
    writeJson(path.join(currentDir, 'PULSE_FLOW_PROJECTION.json'), {
      flows: [
        {
          id: 'flow:opaque-resolution',
          name: 'Opaque resolution',
          capabilityIds: ['capability:opaque-runtime'],
          routePatterns: ['/opaque/:id'],
        },
      ],
    });
    writeJson(path.join(currentDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'), {
      generatedAt: '2026-04-29T20:00:00.000Z',
      truthMode: 'observed',
      adapters: [
        { source: 'sentry', status: 'ready' },
        { source: 'github', status: 'ready' },
        { source: 'codacy', status: 'ready' },
        { source: 'dependabot', status: 'ready' },
      ],
      signals: [
        {
          id: 'runtime-opaque',
          type: 'opaque_event',
          source: 'sentry',
          truthMode: 'observed',
          severity: 0.35,
          impactScore: 0.4,
          runtimeBaselineScore: 0.92,
          blastRadiusScore: 0.86,
          affectedUsers: 1200,
          trend: 'worsening',
          confidence: 0.96,
          summary: 'Opaque runtime processor timed out.',
          relatedFiles: ['backend/src/opaque/runtime.service.ts'],
          observedPayload: {
            traceId: 'trace-opaque',
            statusCode: 504,
            durationMs: 9100,
            baselineP95Ms: 200,
          },
        },
        {
          id: 'change-opaque',
          type: 'opaque_event',
          source: 'github',
          truthMode: 'observed',
          severity: 0.6,
          impactScore: 0.66,
          confidence: 0.88,
          summary: 'Opaque resolver changed.',
          affectedCapabilities: ['capability:opaque-runtime'],
          observedPayload: {
            commitSha: 'abc123',
            changedFiles: ['backend/src/opaque/runtime.service.ts'],
          },
        },
        {
          id: 'static-opaque',
          type: 'opaque_event',
          source: 'codacy',
          truthMode: 'observed',
          severity: 0.7,
          impactScore: 0.72,
          confidence: 0.9,
          summary: 'Opaque resolver static complexity hotspot.',
          affectedFlows: ['flow:opaque-resolution'],
          observedPayload: {
            ruleId: 'complexity',
            findingId: 'codacy-finding-1',
            filePath: 'backend/src/opaque/runtime.service.ts',
          },
        },
        {
          id: 'dependency-opaque',
          type: 'opaque_event',
          source: 'dependabot',
          truthMode: 'inferred',
          severity: 0.8,
          impactScore: 0.82,
          confidence: 0.79,
          summary: 'Opaque dependency requires update.',
          affectedCapabilities: ['capability:opaque-runtime'],
          observedPayload: {
            packageName: 'opaque-runtime',
            currentVersion: '1.0.0',
            advisoryId: 'CVE-2099-0001',
          },
        },
      ],
    });

    const state = buildRuntimeFusionState(rootDir);
    const signalsById = new Map(state.signals.map((signal) => [signal.id, signal]));

    expect(state.summary.totalSignals).toBe(4);
    expect(state.evidence.externalSignalState.reason).toContain('Dynamic signal semantics');
    expect([...signalsById.values()].map((signal) => signal.evidenceKind).sort()).toEqual([
      'change',
      'dependency',
      'runtime',
      'static',
    ]);

    for (const signal of signalsById.values()) {
      expect(signal.id).toBeTruthy();
      expect(signal.type).toBeTruthy();
      expect(signal.source).toBeTruthy();
      expect(signal.severity).toMatch(/critical|high|medium|low|info/);
      expect(signal.impactScore).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThan(0);
      expect(signal.evidenceMode).toMatch(/observed|inferred/);
      expect(signal.affectedCapabilities).toEqual(signal.affectedCapabilityIds);
      expect(signal.affectedFlows).toEqual(signal.affectedFlowIds);
    }

    expect(signalsById.get('runtime-opaque')?.affectedCapabilityIds).toEqual([
      'capability:opaque-runtime',
    ]);
    expect(signalsById.get('runtime-opaque')?.severity).toBe('critical');
    expect(signalsById.get('runtime-opaque')?.type).toBe('error');
    expect(signalsById.get('runtime-opaque')?.affectedFlowIds).toEqual(['flow:opaque-resolution']);
    expect(signalsById.get('change-opaque')?.affectedFlows).toEqual(['flow:opaque-resolution']);
    expect(signalsById.get('static-opaque')?.affectedCapabilities).toEqual([
      'capability:opaque-runtime',
    ]);
    expect(signalsById.get('dependency-opaque')?.evidenceMode).toBe('inferred');
  });

  it('derives signal ontology from observed evidence shape instead of provider identity', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'), {
      generatedAt: '2026-04-29T20:30:00.000Z',
      truthMode: 'observed',
      adapters: [
        { source: 'sentry', status: 'ready' },
        { source: 'codacy', status: 'ready' },
      ],
      signals: [
        {
          id: 'sentry-static-shape',
          type: 'opaque_event',
          source: 'sentry',
          truthMode: 'observed',
          severity: 0.62,
          impactScore: 0.61,
          confidence: 0.91,
          summary: 'Opaque rule finding in checkout resolver.',
          relatedFiles: ['backend/src/checkout/checkout.service.ts'],
          observedPayload: {
            ruleId: 'complexity',
            findingId: 'static-finding-1',
            filePath: 'backend/src/checkout/checkout.service.ts',
          },
        },
        {
          id: 'codacy-runtime-shape',
          type: 'opaque_event',
          source: 'codacy',
          truthMode: 'observed',
          severity: 0.55,
          impactScore: 0.57,
          runtimeBaselineScore: 0.84,
          trend: 'worsening',
          confidence: 0.93,
          summary: 'Opaque checkout request timed out.',
          observedPayload: {
            traceId: 'trace-checkout-timeout',
            spanId: 'span-checkout-timeout',
            statusCode: 504,
            durationMs: 6400,
          },
        },
      ],
    });

    const state = buildRuntimeFusionState(rootDir);
    const signalsById = new Map(state.signals.map((signal) => [signal.id, signal]));

    expect(signalsById.get('sentry-static-shape')?.evidenceKind).toBe('static');
    expect(signalsById.get('sentry-static-shape')?.type).toBe('code_quality');
    expect(signalsById.get('codacy-runtime-shape')?.evidenceKind).toBe('runtime');
    expect(signalsById.get('codacy-runtime-shape')?.type).toBe('error');
    expect(signalsById.get('codacy-runtime-shape')?.severity).toBe('high');
  });

  it('gives observed runtime evidence higher priority and impact than lint-only findings', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_CAPABILITY_STATE.json'), {
      capabilities: [
        {
          id: 'capability:runtime-checkout',
          name: 'Runtime Checkout',
          filePaths: ['backend/src/runtime-checkout.ts'],
        },
        {
          id: 'capability:lint-checkout',
          name: 'Lint Checkout',
          filePaths: ['backend/src/lint-checkout.ts'],
        },
      ],
    });
    writeJson(path.join(currentDir, 'PULSE_CONVERGENCE_PLAN.json'), {
      priorities: {
        'capability:runtime-checkout': 'P2',
        'capability:lint-checkout': 'P2',
      },
    });
    writeJson(path.join(currentDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'), {
      generatedAt: '2026-04-29T21:00:00.000Z',
      truthMode: 'observed',
      adapters: [
        { source: 'sentry', status: 'ready' },
        { source: 'codacy', status: 'ready' },
      ],
      signals: [
        {
          id: 'sentry-runtime-checkout',
          type: 'opaque_event',
          source: 'sentry',
          truthMode: 'observed',
          severity: 0.74,
          impactScore: 0.74,
          runtimeBaselineScore: 0.9,
          summary: 'Checkout runtime timeout.',
          relatedFiles: ['backend/src/runtime-checkout.ts'],
          observedPayload: {
            traceId: 'trace-runtime-checkout',
            statusCode: 504,
            durationMs: 7200,
          },
        },
        {
          id: 'codacy-lint-checkout',
          type: 'opaque_event',
          source: 'codacy',
          truthMode: 'observed',
          severity: 1,
          impactScore: 1,
          summary: 'Checkout lint complexity hotspot.',
          relatedFiles: ['backend/src/lint-checkout.ts'],
          observedPayload: {
            ruleId: 'complexity',
            findingId: 'codacy-finding-2',
            filePath: 'backend/src/lint-checkout.ts',
          },
        },
      ],
    });

    const state = buildRuntimeFusionState(rootDir);
    const runtimeSignal = state.signals.find((signal) => signal.id === 'sentry-runtime-checkout');
    const lintSignal = state.signals.find((signal) => signal.id === 'codacy-lint-checkout');

    expect(runtimeSignal?.evidenceKind).toBe('runtime');
    expect(lintSignal?.evidenceKind).toBe('static');
    expect(runtimeSignal?.impactScore).toBeGreaterThan(lintSignal?.impactScore ?? 0);
    expect(state.summary.topImpactCapabilities[0]).toEqual(
      expect.objectContaining({ capabilityId: 'capability:runtime-checkout' }),
    );
    expect(state.priorityOverrides).toEqual([
      expect.objectContaining({ capabilityId: 'capability:runtime-checkout', newPriority: 'P0' }),
    ]);
  });

  it('reports empty external adapter output as not_available instead of observed proof', () => {
    const { rootDir, currentDir } = createPulseRoot();

    writeJson(path.join(currentDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'), {
      generatedAt: '2026-04-29T21:10:00.000Z',
      truthMode: 'observed',
      adapters: [{ source: 'datadog', status: 'not_available' }],
      signals: [],
    });

    const state = buildRuntimeFusionState(rootDir);

    expect(state.evidence.externalSignalState.status).toBe('not_available');
    expect(state.evidence.externalSignalState.notAvailableAdapters).toEqual(['datadog']);
    expect(state.machineImprovementSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetEngine: 'external-sources-orchestrator',
          truthMode: 'not_available',
          sourceStatus: 'not_available',
        }),
      ]),
    );
  });
});
