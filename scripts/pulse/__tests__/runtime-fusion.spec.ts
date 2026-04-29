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

  it('normalizes runtime, change, static, and dependency signals into operational evidence', () => {
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
          type: 'runtime_timeout',
          source: 'sentry',
          truthMode: 'observed',
          severity: 0.9,
          impactScore: 0.91,
          confidence: 0.96,
          summary: 'Opaque runtime processor timed out.',
          relatedFiles: ['backend/src/opaque/runtime.service.ts'],
        },
        {
          id: 'change-opaque',
          type: 'pull_request_change',
          source: 'github',
          truthMode: 'observed',
          severity: 0.6,
          impactScore: 0.66,
          confidence: 0.88,
          summary: 'Opaque resolver changed.',
          affectedCapabilities: ['capability:opaque-runtime'],
        },
        {
          id: 'static-opaque',
          type: 'static_complexity',
          source: 'codacy',
          truthMode: 'observed',
          severity: 0.7,
          impactScore: 0.72,
          confidence: 0.9,
          summary: 'Opaque resolver static complexity hotspot.',
          affectedFlows: ['flow:opaque-resolution'],
        },
        {
          id: 'dependency-opaque',
          type: 'dependency_vulnerability',
          source: 'dependabot',
          truthMode: 'inferred',
          severity: 0.8,
          impactScore: 0.82,
          confidence: 0.79,
          summary: 'Opaque dependency requires update.',
          affectedCapabilities: ['capability:opaque-runtime'],
        },
      ],
    });

    const state = buildRuntimeFusionState(rootDir);
    const signalsById = new Map(state.signals.map((signal) => [signal.id, signal]));

    expect(state.summary.totalSignals).toBe(4);
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
    expect(signalsById.get('runtime-opaque')?.affectedFlowIds).toEqual(['flow:opaque-resolution']);
    expect(signalsById.get('change-opaque')?.affectedFlows).toEqual(['flow:opaque-resolution']);
    expect(signalsById.get('static-opaque')?.affectedCapabilities).toEqual([
      'capability:opaque-runtime',
    ]);
    expect(signalsById.get('dependency-opaque')?.evidenceMode).toBe('inferred');
  });
});
