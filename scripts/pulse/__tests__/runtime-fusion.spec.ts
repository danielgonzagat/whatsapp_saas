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
});
