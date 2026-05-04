/**
 * PULSE Parser 45: Auth Flow Tester
 * Layer 3: Integration Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * - Discover protected GET routes from controller guard evidence.
 * - Call a protected route WITHOUT JWT → must return 401
 * - Call with malformed JWT material → must return 401
 * - Call with valid test JWT → should return 200 or 403 (not 500)
 * - Call with alg=none JWT → must return 401
 *
 * BREAK TYPES: synthesized from observed auth-flow predicates.
 */

import type { Break, PulseConfig } from '../types';
import { discoverAPIEndpoints } from '../api-fuzzer';
import type { APIEndpointProbe } from '../types.api-fuzzer';
import { httpGet, makeTestJwt } from './runtime-utils';

interface AuthFlowDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  endpoint: string;
  description: string;
  detail: string;
  observedStatus: number;
}

function diagnosticType(predicateKinds: string[]): string {
  const predicateToken =
    predicateKinds
      .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
      .filter(Boolean)
      .join('+') || 'auth-flow-observation';

  return `diagnostic:auth-flow:${predicateToken}`;
}

function authFlowDiagnostic(input: AuthFlowDiagnosticInput): Break {
  return {
    type: diagnosticType(input.predicateKinds),
    severity: input.severity,
    file: 'scripts/pulse/parsers/auth-flow-tester.ts',
    line: 0,
    description: input.description,
    detail: input.detail,
    source: `runtime-probe:auth-flow;endpoint=${input.endpoint};status=${input.observedStatus};predicates=${input.predicateKinds.join(',')}`,
    surface: 'auth-flow',
  };
}

function endpointProbePath(endpoint: APIEndpointProbe): string {
  return endpoint.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) {
        return segment;
      }
      const parameterName = segment.slice(1).trim();
      return encodeURIComponent(`pulse-${parameterName || 'parameter'}`);
    })
    .join('/');
}

function discoverProtectedGetProbePaths(config: PulseConfig): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const endpoint of discoverAPIEndpoints(config.rootDir)) {
    if (endpoint.method !== 'GET' || !endpoint.requiresAuth) {
      continue;
    }
    const probePath = endpointProbePath(endpoint);
    if (!seen.has(probePath)) {
      seen.add(probePath);
      paths.push(probePath);
    }
  }

  return paths;
}

/** Build an alg=none JWT (unsigned — must be rejected by server) */
function makeAlgNoneJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: `pulse-probe-${now}`,
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  // No signature — alg=none means empty sig
  return `${header}.${payload}.`;
}

/** Check auth flow. */
export async function checkAuthFlow(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];

  const validJwt = makeTestJwt();
  const algNoneJwt = makeAlgNoneJwt();
  const malformedJwt = `pulse-malformed-${Date.now().toString(36)}`;

  for (const endpoint of discoverProtectedGetProbePaths(config)) {
    // ── Test 1: No JWT → must return 401 ──────────────────────────────────
    let resNoJwt: Awaited<ReturnType<typeof httpGet>>;
    try {
      resNoJwt = await httpGet(endpoint, { timeout: 8000 });
    } catch {
      continue; // backend not running
    }
    if (resNoJwt.status === 0) {
      continue;
    } // network error

    if (resNoJwt.status === 200) {
      breaks.push(
        authFlowDiagnostic({
          predicateKinds: ['protected endpoint', 'missing credential', 'accepted request'],
          severity: 'critical',
          endpoint,
          observedStatus: resNoJwt.status,
          description: `${endpoint} returns 200 without credential material`,
          detail: `Discovered protected endpoint accepted a request with no Authorization header.`,
        }),
      );
    }

    // ── Test 2: malformed JWT material → must return 401 ─────────────────
    let resBadJwt: Awaited<ReturnType<typeof httpGet>>;
    try {
      resBadJwt = await httpGet(endpoint, { jwt: malformedJwt, timeout: 8000 });
    } catch {
      continue;
    }
    if (resBadJwt.status === 0) {
      continue;
    }

    if (resBadJwt.status === 200) {
      breaks.push(
        authFlowDiagnostic({
          predicateKinds: ['protected endpoint', 'malformed credential', 'accepted request'],
          severity: 'critical',
          endpoint,
          observedStatus: resBadJwt.status,
          description: `${endpoint} returns 200 with malformed credential material`,
          detail: `Discovered protected endpoint accepted a non-JWT bearer value as valid authentication.`,
        }),
      );
    }

    // ── Test 3: alg=none JWT → must return 401 ────────────────────────────
    let resAlgNone: Awaited<ReturnType<typeof httpGet>>;
    try {
      resAlgNone = await httpGet(endpoint, { jwt: algNoneJwt, timeout: 8000 });
    } catch {
      continue;
    }
    if (resAlgNone.status === 0) {
      continue;
    }

    if (resAlgNone.status === 200) {
      breaks.push(
        authFlowDiagnostic({
          predicateKinds: ['protected endpoint', 'unsigned jwt', 'accepted request'],
          severity: 'critical',
          endpoint,
          observedStatus: resAlgNone.status,
          description: `${endpoint} accepts unsigned JWT credential material`,
          detail: `Discovered protected endpoint accepted an unsigned JWT, indicating algorithm-confusion exposure.`,
        }),
      );
    }

    // ── Test 4: Valid JWT → must NOT return 500 ───────────────────────────
    let resValidJwt: Awaited<ReturnType<typeof httpGet>>;
    try {
      resValidJwt = await httpGet(endpoint, { jwt: validJwt, timeout: 8000 });
    } catch {
      continue;
    }
    if (resValidJwt.status === 0) {
      continue;
    }

    if (resValidJwt.status >= 500) {
      breaks.push(
        authFlowDiagnostic({
          predicateKinds: ['protected endpoint', 'valid credential', 'server error'],
          severity: 'critical',
          endpoint,
          observedStatus: resValidJwt.status,
          description: `${endpoint} returns ${resValidJwt.status} with valid credential material`,
          detail: `A structurally valid JWT should not cause a 5xx error. Body: ${JSON.stringify(resValidJwt.body).slice(0, 200)}`,
        }),
      );
    }
  }

  return breaks;
}
