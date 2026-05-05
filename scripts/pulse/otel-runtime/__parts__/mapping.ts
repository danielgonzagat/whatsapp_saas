// PULSE — Span-to-path mapping & trace summary computation

import * as path from 'path';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type {
  OtelSpan,
  OtelTrace,
  OtelTraceSummary,
  SpanToPathMapping,
} from '../../types.otel-runtime';
import type { PulseStructuralEdge } from '../../types.structural';
import { nowIso } from './constants';

// ─── Span-to-path matching ───────────────────────────────────────────────────

function extractRouteFromSpan(span: OtelSpan): { method: string | null; path: string } | null {
  const attributeEntries = Object.entries(span.attributes);
  const methodValue = attributeEntries.find(([key, value]) => {
    const loweredKey = key.toLowerCase();
    return loweredKey.includes('method') && typeof value === 'string' && value.length > 0;
  })?.[1];
  const pathValue = attributeEntries.find(([key, value]) => {
    const loweredKey = key.toLowerCase();
    return (
      typeof value === 'string' &&
      value.startsWith('/') &&
      (loweredKey.includes('route') || loweredKey.includes('path') || loweredKey.includes('url'))
    );
  })?.[1];

  if (typeof pathValue === 'string') {
    return {
      method: typeof methodValue === 'string' ? methodValue.toUpperCase() : null,
      path: pathValue,
    };
  }

  const tokens = span.name.split(/\s+/).filter(Boolean);
  const observedMethod = tokens.find((token) => /^[A-Z]+$/.test(token)) ?? null;
  const observedPath = tokens.find((token) => token.startsWith('/'));
  return observedPath ? { method: observedMethod, path: observedPath } : null;
}

export function formatRoute(route: { method: string | null; path: string }): string {
  return route.method ? `${route.method} ${route.path}` : route.path;
}

export function buildSpanToPathMappings(
  spans: OtelSpan[],
  nodesAndFiles: Array<{ nodeId: string; filePath: string }>,
  edges: PulseStructuralEdge[],
): SpanToPathMapping[] {
  const mappings: SpanToPathMapping[] = [];

  for (const span of spans) {
    const matchedNodeIds: string[] = [];
    const matchedFilePaths: string[] = [];

    const route = extractRouteFromSpan(span);
    if (route) {
      const observedRouteParts = route.path.split('/').filter(Boolean);
      for (const edge of edges) {
        const edgeContainsRoute = observedRouteParts.some(
          (seg) =>
            edge.from.toLowerCase().includes(seg.toLowerCase()) ||
            edge.to.toLowerCase().includes(seg.toLowerCase()),
        );
        if (edgeContainsRoute) {
          if (!matchedNodeIds.includes(edge.to)) matchedNodeIds.push(edge.to);
          if (!matchedNodeIds.includes(edge.from)) matchedNodeIds.push(edge.from);
        }
      }
    }

    const lowerName = span.name.toLowerCase();
    const lowerService = span.serviceName.toLowerCase();
    for (const node of nodesAndFiles) {
      const lowerFile = node.filePath.toLowerCase();
      if (
        lowerName.includes(path.basename(lowerFile, path.extname(lowerFile))) ||
        lowerService === path.basename(path.dirname(lowerFile))
      ) {
        if (!matchedNodeIds.includes(node.nodeId)) matchedNodeIds.push(node.nodeId);
        if (!matchedFilePaths.includes(node.filePath)) matchedFilePaths.push(node.filePath);
      }
    }

    const confidence =
      matchedNodeIds.length > 0
        ? Math.min(deriveUnitValue(), matchedNodeIds.length * 0.4)
        : route
          ? 0.3
          : 0.1;

    mappings.push({
      spanName: span.name,
      matchedNodeIds,
      matchedFilePaths,
      confidence,
    });
  }

  return mappings;
}

// ─── Summary computation ─────────────────────────────────────────────────────

export function computeTraceSummary(traces: OtelTrace[]): OtelTraceSummary {
  const serviceMap: Record<string, number> = {};
  const endpointMap: Record<string, number> = {};
  let totalSpans = 0;
  let errorTraces = 0;
  const durations: number[] = [];

  for (const trace of traces) {
    totalSpans += trace.spans.length;
    durations.push(trace.totalDurationMs);
    if (trace.errorSpans > 0) errorTraces++;

    for (const span of trace.spans) {
      const svc = span.serviceName || 'unknown';
      serviceMap[svc] = (serviceMap[svc] || deriveZeroValue()) + deriveUnitValue();

      const route = extractRouteFromSpan(span);
      if (route) {
        const routeKey = formatRoute(route);
        endpointMap[routeKey] = (endpointMap[routeKey] || deriveZeroValue()) + deriveUnitValue();
      }
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const p95Idx = Math.max(deriveZeroValue(), Math.ceil(sorted.length * 0.95) - deriveUnitValue());
  const p99Idx = Math.max(deriveZeroValue(), Math.ceil(sorted.length * 0.99) - deriveUnitValue());

  return {
    totalTraces: traces.length,
    totalSpans,
    errorTraces,
    avgDurationMs:
      traces.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / traces.length) : 0,
    p95DurationMs: sorted.length > 0 ? sorted[p95Idx] : 0,
    p99DurationMs: sorted.length > 0 ? sorted[p99Idx] : 0,
    serviceMap,
    endpointMap,
  };
}
