/**
 * PULSE Parser 58: Performance — Response Time
 * Layer 6: Performance Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Measure actual HTTP response time for a sample of GET endpoints.
 * Takes median of 3 consecutive requests to discard cold-start outliers.
 *
 * Emits observed HTTP latency evidence. Diagnostic identity is synthesized
 * downstream from runtime signals and predicates.
 */

import type { Break, PulseConfig } from '../types';
import { httpGet, makeTestJwt } from './runtime-utils';
import { buildParserDiagnosticBreak } from './diagnostic-break';

const ENDPOINTS_TO_MEASURE = [
  '/products',
  '/workspace',
  '/crm/contacts',
  '/billing/status',
  '/autopilot/status',
  '/reports/summary',
  '/analytics/revenue',
  '/health/system',
  '/inbox/conversations',
  '/flows',
];

const VERY_SLOW_THRESHOLD_MS = 2000;
const SLOW_THRESHOLD_MS = 500;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Check performance response time. */
export async function checkPerformanceResponseTime(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];
  const jwt = makeTestJwt();
  const baseFile = 'scripts/pulse/parsers/performance-response-time.ts';

  for (const endpoint of ENDPOINTS_TO_MEASURE) {
    const timings: number[] = [];
    let networkError = false;

    for (let i = 0; i < 3; i++) {
      let res: Awaited<ReturnType<typeof httpGet>>;
      try {
        res = await httpGet(endpoint, { jwt, timeout: 10000 });
      } catch {
        networkError = true;
        break;
      }
      // status 0 = network error (backend not running)
      if (res.status === 0) {
        networkError = true;
        break;
      }
      timings.push(res.timeMs);
    }

    if (networkError || timings.length === 0) {
      continue;
    }

    const medianMs = median(timings);

    if (medianMs > VERY_SLOW_THRESHOLD_MS) {
      breaks.push(
        buildParserDiagnosticBreak({
          detector: 'http-response-time-probe',
          source: 'runtime-http-probe:performance-response-time',
          truthMode: 'observed',
          severity: 'high',
          file: baseFile,
          line: 0,
          summary: 'Runtime HTTP probe observed endpoint latency above the severe threshold',
          detail: `GET ${endpoint}; median of 3 requests: ${medianMs}ms. Individual timings: ${timings.join('ms, ')}ms. Threshold: ${VERY_SLOW_THRESHOLD_MS}ms`,
          surface: 'runtime-http-latency',
          runtimeImpact: 1,
        }),
      );
    } else if (medianMs > SLOW_THRESHOLD_MS) {
      breaks.push(
        buildParserDiagnosticBreak({
          detector: 'http-response-time-probe',
          source: 'runtime-http-probe:performance-response-time',
          truthMode: 'observed',
          severity: 'medium',
          file: baseFile,
          line: 0,
          summary: 'Runtime HTTP probe observed endpoint latency above the warning threshold',
          detail: `GET ${endpoint}; median of 3 requests: ${medianMs}ms. Individual timings: ${timings.join('ms, ')}ms. Threshold: ${SLOW_THRESHOLD_MS}ms`,
          surface: 'runtime-http-latency',
          runtimeImpact: 0.6,
        }),
      );
    }
  }

  return breaks;
}
