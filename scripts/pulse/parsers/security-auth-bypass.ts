/**
 * PULSE Parser 56: Security — Auth Bypass
 * Layer 5: Security Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * For 10 protected endpoints:
 * - Call WITHOUT JWT → must return 401 (not 200)
 * - Call with expired JWT → must return 401 (not 200 or 500)
 * - Call with alg=none JWT → must return 401 (prevents algorithm confusion attack)
 *
 * BREAK TYPES:
 * - AUTH_BYPASS_VULNERABLE (critical) — protected endpoint accessible without valid JWT
 */

import type { Break, PulseConfig } from '../types';
import { httpGet, makeTestJwt } from './runtime-utils';

const PROTECTED_ENDPOINTS = [
  '/products',
  '/workspace',
  '/billing/status',
  '/crm/contacts',
  '/autopilot/status',
  '/flows',
  '/inbox/conversations',
  '/reports/summary',
  '/analytics/revenue',
  '/wallet/balance',
];

/** Build a JWT expired 1 hour ago */
function makeExpiredJwt(): string {
  return makeTestJwt({}, -3600); // negative expiresInSec = already expired
}

/** Build an alg=none JWT (unsigned) */
function makeAlgNoneJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'pulse-attacker',
      email: 'attack@pulse.kloel.com',
      workspaceId: 'malicious-workspace',
      role: 'ADMIN',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.`; // no signature
}

interface TestCase {
  label: string;
  jwt: string | undefined;
  detail: string;
}

/** Check security auth bypass. */
export async function checkSecurityAuthBypass(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];
  const baseFile = 'scripts/pulse/parsers/security-auth-bypass.ts';

  const testCases: TestCase[] = [
    { label: 'no JWT', jwt: undefined, detail: 'Request sent with no Authorization header' },
    {
      label: 'expired JWT',
      jwt: makeExpiredJwt(),
      detail: 'JWT with exp set to 1 hour in the past',
    },
    {
      label: 'alg=none JWT',
      jwt: makeAlgNoneJwt(),
      detail: 'Unsigned JWT with alg=none (algorithm confusion attack)',
    },
    {
      label: 'malformed JWT "not-a-jwt"',
      jwt: 'not-a-jwt',
      detail: 'Plain string passed as Bearer token',
    },
    {
      label: 'malformed JWT "a.b.c"',
      jwt: 'a.b.c',
      detail: 'Three-part string with invalid base64 segments',
    },
  ];

  for (const endpoint of PROTECTED_ENDPOINTS) {
    for (const tc of testCases) {
      let res: Awaited<ReturnType<typeof httpGet>>;
      try {
        res = await httpGet(endpoint, { jwt: tc.jwt, timeout: 8000 });
      } catch {
        continue; // backend not running — skip
      }
      if (res.status === 0) {
        continue;
      } // network error

      if (res.status === 200) {
        breaks.push({
          type: 'AUTH_BYPASS_VULNERABLE',
          severity: 'critical',
          file: baseFile,
          line: 0,
          description: `${endpoint} returned 200 with ${tc.label}`,
          detail: `${tc.detail}. This endpoint is accessible without valid authentication.`,
        });
      }

      // 500 with expired/malformed token is also suspicious (should be 401)
      if (res.status >= 500 && tc.label !== 'no JWT') {
        breaks.push({
          type: 'AUTH_BYPASS_VULNERABLE',
          severity: 'high',
          file: baseFile,
          line: 0,
          description: `${endpoint} returned ${res.status} with ${tc.label} (expected 401)`,
          detail: `${tc.detail}. Server crashed instead of rejecting invalid credentials. Body: ${JSON.stringify(res.body).slice(0, 200)}`,
        });
      }
    }
  }

  return breaks;
}
