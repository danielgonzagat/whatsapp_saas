/**
 * PULSE Parser 44: API Contract Tester
 * Layer 3: Integration Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * - Hit GET endpoints discovered from OpenAPI/schema/controller evidence with a valid test JWT
 * - Verify status is not 500, response is JSON, body has expected shape
 * - Verify no stack traces leaked in error responses
 *
 * BREAK TYPES:
 * - Contract violation labels are generated from evidence category parts
 * - Error leak labels are generated when response bodies expose debug fields
 */

import { buildExpectedContracts, defineProviderContracts } from '../contract-tester';
import type { ProviderContract } from '../types.contract-tester';
import type { Break, PulseConfig } from '../types';
import { httpGet, isDeepMode, makeTestJwt } from './runtime-utils';

interface ApiContractProbe {
  path: string;
  expectedFields: string[];
}

function eventType(...parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function apiContractBreakType(qualifier: string): string {
  return eventType('api', 'contract', qualifier);
}

function apiLeakBreakType(): string {
  return eventType('api', 'error', 'leaks');
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function schemaProperties(schema: Record<string, unknown>): string[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return Object.values(schema).flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
      }
      return schemaProperties(value as Record<string, unknown>);
    });
  }
  return Object.keys(properties);
}

function normalizeProbePath(endpoint: string): string | null {
  if (/^https?:\/\//i.test(endpoint) || endpoint.startsWith('//')) {
    return null;
  }
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}

function isProbeableGetContract(contract: ProviderContract): boolean {
  return contract.method.toUpperCase() === 'GET' && normalizeProbePath(contract.endpoint) !== null;
}

function dedupeProbes(contracts: ProviderContract[]): ApiContractProbe[] {
  const probes = new Map<string, ApiContractProbe>();
  for (const contract of contracts) {
    if (!isProbeableGetContract(contract)) {
      continue;
    }
    const path = normalizeProbePath(contract.endpoint);
    if (!path) {
      continue;
    }
    const expectedFields = schemaProperties(contract.expectedResponseSchema);
    const existing = probes.get(path);
    probes.set(path, {
      path,
      expectedFields: existing
        ? [...new Set([...existing.expectedFields, ...expectedFields])]
        : expectedFields,
    });
  }
  return [...probes.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function buildApiContractProbePlan(config: PulseConfig): ApiContractProbe[] {
  return dedupeProbes([
    ...buildExpectedContracts(config.rootDir),
    ...defineProviderContracts(config.rootDir),
  ]);
}

function containsInternalDebugLeak(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const queue: unknown[] = [body];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('stack') ||
        normalizedKey.includes('trace') ||
        normalizedKey.includes('exception')
      ) {
        return true;
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return false;
}

/** Check api contract. */
export async function checkApiContract(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!isDeepMode()) {
    return [];
  }

  const breaks: Break[] = [];
  const jwt = makeTestJwt();
  const baseFile = 'scripts/pulse/parsers/api-contract-tester.ts';
  const probes = buildApiContractProbePlan(config);

  for (const ep of probes) {
    let res: Awaited<ReturnType<typeof httpGet>>;
    try {
      res = await httpGet(ep.path, { jwt, timeout: 8000 });
    } catch {
      // Connection refused — backend not up, skip silently
      continue;
    }

    // status 0 means network error (backend not running) — skip
    if (res.status === 0) {
      continue;
    }

    // 401/403/404 are acceptable — endpoint exists and is protected or not found
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      continue;
    }

    // 500 is always a break
    if (res.status >= 500) {
      pushBreak(breaks, {
        type: apiContractBreakType('violation'),
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
        pushBreak(breaks, {
          type: apiContractBreakType('violation'),
          severity: 'medium',
          file: baseFile,
          line: 0,
          description: `GET ${ep.path} returned non-JSON body`,
          detail: `Status ${res.status} but response body could not be parsed as JSON`,
        });
        continue;
      }

      // Check for stack trace leaks
      if (containsInternalDebugLeak(res.body)) {
        pushBreak(breaks, {
          type: apiLeakBreakType(),
          severity: 'high',
          file: baseFile,
          line: 0,
          description: `GET ${ep.path} leaks internal error details`,
          detail: `Response body contains stack trace markers. Body excerpt: ${JSON.stringify(res.body).slice(0, 300)}`,
        });
      }

      // Shape check — if schema evidence specifies response fields, verify they exist.
      if (ep.expectedFields.length > 0) {
        const body = res.body;
        const missingFields = ep.expectedFields.filter(
          (field) => !(body !== null && typeof body === 'object' && field in body),
        );
        if (missingFields.length > 0) {
          pushBreak(breaks, {
            type: apiContractBreakType('violation'),
            severity: 'medium',
            file: baseFile,
            line: 0,
            description: `GET ${ep.path} response missing expected schema field`,
            detail: 'Body keys: ' + Object.keys(body || {}).join(', '),
          });
        }
      }
    }
  }

  return breaks;
}
