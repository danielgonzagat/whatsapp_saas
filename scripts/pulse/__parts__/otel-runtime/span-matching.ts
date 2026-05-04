import * as path from 'path';
import type { OtelSpan } from '../../types.otel-runtime';
import type { SpanToPathMapping } from '../../types.otel-runtime';
import type { PulseStructuralEdge } from '../../types';

export function extractRouteFromSpan(span: OtelSpan): { method: string | null; path: string } | null {
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
      matchedNodeIds.length > 0 ? Math.min(1, matchedNodeIds.length * 0.4) : route ? 0.3 : 0.1;

    mappings.push({
      spanName: span.name,
      matchedNodeIds,
      matchedFilePaths,
      confidence,
    });
  }

  return mappings;
}
