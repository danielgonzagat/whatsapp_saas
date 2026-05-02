import type { OtelTrace, OtelTraceSummary } from '../../types.otel-runtime';
import { extractRouteFromSpan, formatRoute } from './span-matching';

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
      serviceMap[svc] = (serviceMap[svc] || 0) + 1;

      const route = extractRouteFromSpan(span);
      if (route) {
        const routeKey = formatRoute(route);
        endpointMap[routeKey] = (endpointMap[routeKey] || 0) + 1;
      }
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const p95Idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const p99Idx = Math.max(0, Math.ceil(sorted.length * 0.99) - 1);

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
