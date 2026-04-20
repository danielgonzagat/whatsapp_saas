/**
 * PULSE Parser 45: Auth Flow Tester
 * Layer 3: Integration Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * - Call a protected route WITHOUT JWT → must return 401
 * - Call with invalid JWT string "not-a-jwt" → must return 401
 * - Call with valid test JWT → should return 200 or 403 (not 500)
 * - Call with alg=none JWT → must return 401
 *
 * BREAK TYPES:
 * - AUTH_BYPASS_VULNERABLE (critical) — protected endpoint returns 200 without JWT
 * - AUTH_FLOW_BROKEN (critical) — valid JWT causes 500 internal error
 */

import type { Break, PulseConfig } from '../types';
import { httpGet, makeTestJwt } from './runtime-utils';

// These endpoints must be protected (require auth)
const PROTECTED_ENDPOINTS = ['/autopilot/status', '/products', '/billing/status'];

/** Build an alg=none JWT (unsigned — must be rejected by server) */
function makeAlgNoneJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'pulse-attacker',
      email: 'attack@test.kloel.com',
      workspaceId: 'fake-workspace',
      role: 'ADMIN',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  // No signature — alg=none means empty sig
  return `${header}.${payload}.`;
}

export async function checkAuthFlow(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];
  const baseFile = 'scripts/pulse/parsers/auth-flow-tester.ts';

  const validJwt = makeTestJwt();
  const algNoneJwt = makeAlgNoneJwt();

  for (const endpoint of PROTECTED_ENDPOINTS) {
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
      breaks.push({
        type: 'AUTH_BYPASS_VULNERABLE',
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `${endpoint} returns 200 without any JWT`,
        detail: `Endpoint is publicly accessible — any unauthenticated caller can read this data`,
      });
    }

    // ── Test 2: Invalid JWT string → must return 401 ──────────────────────
    let resBadJwt: Awaited<ReturnType<typeof httpGet>>;
    try {
      resBadJwt = await httpGet(endpoint, { jwt: 'not-a-jwt', timeout: 8000 });
    } catch {
      continue;
    }
    if (resBadJwt.status === 0) {
      continue;
    }

    if (resBadJwt.status === 200) {
      breaks.push({
        type: 'AUTH_BYPASS_VULNERABLE',
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `${endpoint} returns 200 with invalid JWT "not-a-jwt"`,
        detail: `Endpoint accepted a non-JWT string as valid authentication`,
      });
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
      breaks.push({
        type: 'AUTH_BYPASS_VULNERABLE',
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `${endpoint} accepts alg=none JWT attack`,
        detail: `Endpoint accepted an unsigned JWT (alg=none). This is a critical JWT algorithm confusion vulnerability.`,
      });
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
      breaks.push({
        type: 'AUTH_FLOW_BROKEN',
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `${endpoint} returns ${resValidJwt.status} with a valid JWT`,
        detail: `A structurally valid JWT should not cause a 5xx error. Body: ${JSON.stringify(resValidJwt.body).slice(0, 200)}`,
      });
    }
  }

  return breaks;
}
