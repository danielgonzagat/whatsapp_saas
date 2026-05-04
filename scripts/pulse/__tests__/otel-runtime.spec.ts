import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectRuntimeTraces, compareWithStaticGraph } from '../otel-runtime';
import type { RuntimeCallGraphEvidence, OtelSpan, OtelTrace } from '../types.otel-runtime';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-otel-runtime-'));
  tempRoots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, '.pulse', 'current'), { recursive: true });
  return rootDir;
}

function writeJson(filePath: string, payload: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function makeSpan(traceId: string, source: string, target: string): OtelSpan {
  return {
    spanId: 'span-1',
    parentSpanId: null,
    traceId,
    name: 'GET /api/orders',
    kind: 'server',
    serviceName: 'backend',
    attributes: {
      'service.name': 'backend',
      'pulse.structural.from': source,
      'pulse.structural.to': target,
    },
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-01-01T00:00:00.020Z',
    durationMs: 20,
    status: 'ok',
    statusMessage: null,
    events: [],
  };
}

function makeTrace(traceId: string, source: string, target: string): OtelTrace {
  const span = makeSpan(traceId, source, target);
  return {
    traceId,
    rootSpan: span,
    spans: [span],
    totalDurationMs: 20,
    errorSpans: 0,
    serviceBoundaries: 0,
  };
}

function makeEvidence(
  source: RuntimeCallGraphEvidence['source'],
  trace: OtelTrace,
): RuntimeCallGraphEvidence {
  const runtimeObserved = source === 'real' || source === 'manual';
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    source,
    sourceDetails: {
      kind:
        source === 'manual'
          ? 'manual_tracer'
          : source === 'simulated'
            ? 'ast_static_map'
            : source === 'real'
              ? 'trace_file'
              : 'none',
      runtimeObserved,
      deterministic: source === 'simulated' || source === 'not_available',
      reason: null,
    },
    summary: {
      totalTraces: 1,
      totalSpans: 1,
      errorTraces: 0,
      avgDurationMs: 20,
      p95DurationMs: 20,
      p99DurationMs: 20,
      serviceMap: { backend: 1 },
      endpointMap: { 'GET /api/orders': 1 },
    },
    traces: [trace],
    spanToPathMappings: [],
    staticGraphCoverage: {
      totalStaticEdges: 1,
      observedInRuntime: 0,
      missingFromRuntime: 1,
      coveragePercent: 0,
    },
    runtimeOnlyEdges: [],
  };
}

function seedStaticArtifacts(rootDir: string): void {
  const currentDir = path.join(rootDir, '.pulse', 'current');
  writeJson(path.join(currentDir, 'PULSE_AST_GRAPH.json'), {
    symbols: [
      {
        id: 'route:orders',
        name: 'OrdersController.list',
        kind: 'api_route',
        filePath: 'backend/src/orders/orders.controller.ts',
        httpMethod: 'GET',
        routePath: '/api/orders',
      },
      {
        id: 'service:orders',
        name: 'OrdersService.list',
        kind: 'service',
        filePath: 'backend/src/orders/orders.service.ts',
      },
    ],
    edges: [{ from: 'route:orders', to: 'service:orders' }],
  });
  writeJson(path.join(currentDir, 'PULSE_STRUCTURAL_GRAPH.json'), {
    nodes: [
      { id: 'route:orders', file: 'backend/src/orders/orders.controller.ts' },
      { id: 'service:orders', file: 'backend/src/orders/orders.service.ts' },
    ],
    edges: [{ from: 'route:orders', to: 'service:orders' }],
  });
}

afterEach(() => {
  for (const rootDir of tempRoots.splice(0)) {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

describe('OTel runtime source contract', () => {
  it('does not count simulated traces as observed runtime coverage', () => {
    const trace = makeTrace('trace-simulated', 'route:orders', 'service:orders');
    const result = compareWithStaticGraph(makeEvidence('simulated', trace), {
      edges: [{ from: 'route:orders', to: 'service:orders' }],
    });

    expect(result.source).toBe('simulated');
    expect(result.sourceDetails.runtimeObserved).toBe(false);
    expect(result.staticGraphCoverage.observedInRuntime).toBe(0);
    expect(result.staticGraphCoverage.missingFromRuntime).toBe(1);
    expect(result.staticGraphCoverage.coveragePercent).toBe(0);
  });

  it('counts manual traces as observed runtime coverage', () => {
    const trace = makeTrace('trace-manual', 'route:orders', 'service:orders');
    const result = compareWithStaticGraph(makeEvidence('manual', trace), {
      edges: [{ from: 'route:orders', to: 'service:orders' }],
    });

    expect(result.source).toBe('manual');
    expect(result.sourceDetails.runtimeObserved).toBe(true);
    expect(result.staticGraphCoverage.observedInRuntime).toBe(1);
    expect(result.staticGraphCoverage.missingFromRuntime).toBe(0);
    expect(result.staticGraphCoverage.coveragePercent).toBe(100);
  });

  it('generates deterministic simulated static maps without runtime coverage credit', () => {
    const rootDir = makeTempRoot();
    seedStaticArtifacts(rootDir);

    const first = collectRuntimeTraces(rootDir, { simulationMode: true });
    const second = collectRuntimeTraces(rootDir, { simulationMode: true });

    expect(first.source).toBe('simulated');
    expect(first.sourceDetails).toMatchObject({
      kind: 'ast_static_map',
      runtimeObserved: false,
      deterministic: true,
    });
    expect(first.staticGraphCoverage.observedInRuntime).toBe(0);
    expect(first.staticGraphCoverage.coveragePercent).toBe(0);
    expect(second.traces).toEqual(first.traces);
    expect(second.summary).toEqual(first.summary);
    expect(second.spanToPathMappings).toEqual(first.spanToPathMappings);
  });

  it('marks collector-only configuration as not available instead of simulated proof', () => {
    const rootDir = makeTempRoot();
    seedStaticArtifacts(rootDir);

    const result = collectRuntimeTraces(rootDir, { collectorUrl: 'http://localhost:4318' });

    expect(result.source).toBe('not_available');
    expect(result.sourceDetails).toMatchObject({
      kind: 'otel_collector',
      runtimeObserved: false,
      deterministic: true,
    });
    expect(result.summary.totalTraces).toBe(0);
    expect(result.staticGraphCoverage.observedInRuntime).toBe(0);
  });
});
