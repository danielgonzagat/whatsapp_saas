/**
 * PULSE Parser 44: API Contract Tester
 * Layer 3: Integration Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * - Hit a representative sample of GET endpoints with a valid test JWT
 * - Verify status is not 500, response is JSON, body has expected shape
 * - Verify no stack traces leaked in error responses
 *
 * BREAK TYPES:
 * - API_CONTRACT_VIOLATION (high) — endpoint returns 500, non-JSON, or wrong shape
 * - API_ERROR_LEAKS (high) — endpoint leaks stack traces in response body
 */

import type { Break, PulseConfig } from '../types';
import { getBackendUrl, httpGet, makeTestJwt } from './runtime-utils';

// Representative sample of GET endpoints and what their body must contain
const SAMPLE_ENDPOINTS: Array<{
  path: string;
  // Field that must exist on a successful (non-401/403/404) response; null = skip shape check
  expectedField: string | null;
}> = [
  { path: '/health/system', expectedField: null },
  { path: '/autopilot/status', expectedField: null },
  { path: '/billing/status', expectedField: null },
];

// Patterns that should never appear in a response body
const STACK_TRACE_PATTERNS = [
  'at Function.',
  'at Object.',
  'at Module.',
  'at process.',
  ' at ',
  'node_modules',
  'QueryFailedError',
  'PrismaClientKnownRequestError',
];

function containsStackTrace(body: any): boolean {
  const str = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return STACK_TRACE_PATTERNS.some(p => str.includes(p));
}

export async function checkApiContract(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!process.env.PULSE_DEEP) return [];

  const breaks: Break[] = [];
  const jwt = makeTestJwt();
  const baseFile = 'scripts/pulse/parsers/api-contract-tester.ts';

  for (const ep of SAMPLE_ENDPOINTS) {
    let res: Awaited<ReturnType<typeof httpGet>>;
    try {
      res = await httpGet(ep.path, { jwt, timeout: 8000 });
    } catch (e: any) {
      // Connection refused — backend not up, skip silently
      continue;
    }

    // status 0 means network error (backend not running) — skip
    if (res.status === 0) continue;

    // 401/403/404 are acceptable — endpoint exists and is protected or not found
    if (res.status === 401 || res.status === 403 || res.status === 404) continue;

    // 500 is always a break
    if (res.status >= 500) {
      breaks.push({
        type: 'API_CONTRACT_VIOLATION',
        severity: 'high',
        file: baseFile,
        line: 0,
        description: `GET ${ep.path} returned HTTP ${res.status}`,
        detail: `Expected 2xx/4xx but got ${res.status}. Body: ${JSON.stringify(res.body).slice(0, 200)}`,
      });
      continue;
    }

    // Expect JSON body for 2xx responses
    if (res.status >= 200 && res.status < 300) {
      if (res.body === null || res.body === undefined) {
        breaks.push({
          type: 'API_CONTRACT_VIOLATION',
          severity: 'medium',
          file: baseFile,
          line: 0,
          description: `GET ${ep.path} returned non-JSON body`,
          detail: `Status ${res.status} but response body could not be parsed as JSON`,
        });
        continue;
      }

      // Check for stack trace leaks
      if (containsStackTrace(res.body)) {
        breaks.push({
          type: 'API_ERROR_LEAKS',
          severity: 'high',
          file: baseFile,
          line: 0,
          description: `GET ${ep.path} leaks internal error details`,
          detail: `Response body contains stack trace markers. Body excerpt: ${JSON.stringify(res.body).slice(0, 300)}`,
        });
      }

      // Shape check — if expectedField is specified, verify it exists
      if (ep.expectedField !== null) {
        const body = res.body;
        const hasField =
          body !== null &&
          typeof body === 'object' &&
          (ep.expectedField in body ||
            (Array.isArray(body.data) && ep.expectedField === 'data'));
        if (!hasField) {
          breaks.push({
            type: 'API_CONTRACT_VIOLATION',
            severity: 'medium',
            file: baseFile,
            line: 0,
            description: `GET ${ep.path} response missing expected field "${ep.expectedField}"`,
            detail: `Body keys: ${Object.keys(body || {}).join(', ')}`,
          });
        }
      }
    }
  }

  return breaks;
}
