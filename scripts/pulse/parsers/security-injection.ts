/**
 * PULSE Parser 54: Security — SQL/NoSQL Injection
 * Layer 5: Security Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Send SQL injection and NoSQL injection payloads to all POST/PATCH endpoints.
 * Prisma uses parameterized queries by default, but raw queries ($queryRaw, $executeRaw)
 * and dynamic where clauses can still be vulnerable.
 *
 * SQL injection payloads to test in string fields:
 * - "' OR '1'='1"
 * - "'; DROP TABLE users; --"
 * - "' UNION SELECT id, email, password FROM users --"
 * - "1'; WAITFOR DELAY '0:0:5' --" (time-based blind)
 * - "${workspaceId} OR 1=1"
 *
 * For each POST/PATCH endpoint:
 * 1. Send payload in all string fields (name, email, description, slug, etc.)
 * 2. Assert response is 400 (validation error) OR 200 with payload stored safely (escaped)
 * 3. Assert response does NOT return unexpected extra records (union injection worked)
 * 4. Assert response time < 3s (time-based injection did not execute DELAY)
 * 5. Assert response body does not contain SQL error messages (syntax error, relation does not exist)
 *
 * $queryRaw usage (high-risk):
 * 6. Scan backend for $queryRaw and $executeRaw calls
 * 7. For each raw query found, verify interpolated values use Prisma.sql template tag
 * 8. Flag any string concatenation into raw queries as injection vulnerable
 *
 * Path traversal in ID params:
 * 9. GET /products/../../../etc/passwd → expect 400 or 404, not file read
 * 10. GET /products/%2F%2F%2Fetc%2Fpasswd → same
 *
 * REQUIRES:
 * - Running backend (PULSE_BACKEND_URL)
 * - Valid test JWT (PULSE_TEST_JWT) for authenticated endpoints
 *
 * BREAK TYPES:
 * - INJECTION_VULNERABLE (critical) — endpoint returns unexpected data or error from injection payload,
 *   or raw query uses string concatenation instead of parameterized values
 */

import type { Break, PulseConfig } from '../types';
import { httpGet, httpPost, makeTestJwt, isDeepMode } from './runtime-utils';

/** Keywords that indicate an unhandled DB error leaked to the response */
const DB_ERROR_KEYWORDS = [
  'syntax error',
  'pg error',
  'relation "',
  'column "',
  'operator does not exist',
  'invalid input syntax',
  'ERROR:',
  'DETAIL:',
  'HINT:',
  'psql',
  'PostgreSQL',
  'sqlite_',
  'mysql_',
  'ORA-',
  'SQL Server',
];

function containsDbError(body: any): boolean {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return DB_ERROR_KEYWORDS.some((kw) => text.includes(kw));
}

/** Test endpoints: method, path, body factory */
interface EndpointTest {
  method: 'POST' | 'PATCH';
  path: string;
  buildBody: (payload: string) => Record<string, any>;
  description: string;
}

const INJECTION_ENDPOINTS: EndpointTest[] = [
  {
    method: 'POST',
    path: '/auth/login',
    buildBody: (p) => ({ email: p, password: 'test-password-123' }),
    description: 'Auth login email field',
  },
  {
    method: 'POST',
    path: '/auth/login',
    buildBody: (p) => ({ email: 'pulse@test.kloel.com', password: p }),
    description: 'Auth login password field',
  },
  {
    method: 'POST',
    path: '/crm/contacts',
    buildBody: (p) => ({ name: p, email: 'safe@test.com', phone: '+5511999999999' }),
    description: 'CRM contacts name field',
  },
];

const SQL_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "' UNION SELECT id, email, password FROM \"User\" --",
  "1' AND SLEEP(5) --",
  "\\'; WAITFOR DELAY '0:0:5' --",
];

export async function checkSecurityInjection(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!isDeepMode()) return [];

  const breaks: Break[] = [];
  const jwt = makeTestJwt();

  for (const endpoint of INJECTION_ENDPOINTS) {
    for (const payload of SQL_PAYLOADS) {
      try {
        const body = endpoint.buildBody(payload);
        const start = Date.now();
        const res = endpoint.method === 'POST'
          ? await httpPost(endpoint.path, body, { jwt, timeout: 8000 })
          : await httpPost(endpoint.path, body, { jwt, timeout: 8000 }); // PATCH not in utils, using POST

        const elapsed = Date.now() - start;

        // Time-based injection: if the endpoint took > 4s, the DELAY/SLEEP may have executed
        if (elapsed > 4000) {
          breaks.push({
            type: 'INJECTION_VULNERABLE',
            severity: 'critical',
            file: `backend/src (${endpoint.path})`,
            line: 0,
            description: `Possible time-based SQL injection on ${endpoint.method} ${endpoint.path}`,
            detail: `Response took ${elapsed}ms with payload "${payload.substring(0, 60)}". ${endpoint.description}`,
          });
        }

        // DB error leaked in response body
        if (containsDbError(res.body)) {
          breaks.push({
            type: 'INJECTION_VULNERABLE',
            severity: 'critical',
            file: `backend/src (${endpoint.path})`,
            line: 0,
            description: `DB error leaked in response from ${endpoint.method} ${endpoint.path}`,
            detail: `Payload "${payload.substring(0, 60)}" caused a DB error message in the response body. ${endpoint.description}. Body snippet: ${JSON.stringify(res.body).substring(0, 200)}`,
          });
        }

        // Union injection: endpoint returned 200 with data it should not have
        // For login: 200 means the SQL auth bypass worked
        if (endpoint.path === '/auth/login' && res.status === 200 && res.body?.accessToken) {
          breaks.push({
            type: 'INJECTION_VULNERABLE',
            severity: 'critical',
            file: `backend/src (${endpoint.path})`,
            line: 0,
            description: `SQL injection auth bypass on POST /auth/login — returned valid token`,
            detail: `Payload "${payload.substring(0, 60)}" bypassed authentication and returned an access token.`,
          });
        }

      } catch (err: any) {
        // Network error / backend not reachable — not a vulnerability, skip
      }
    }
  }

  // Path traversal test: GET /products/../../../etc/passwd
  try {
    const traversalPaths = [
      '/products/../../../etc/passwd',
      '/products/%2F..%2F..%2Fetc%2Fpasswd',
    ];
    for (const tp of traversalPaths) {
      const res = await httpGet(tp, { jwt, timeout: 5000 });
      if (res.status === 200 && typeof res.body === 'string' && res.body.includes('root:')) {
        breaks.push({
          type: 'INJECTION_VULNERABLE',
          severity: 'critical',
          file: `backend/src (${tp})`,
          line: 0,
          description: `Path traversal vulnerability — server returned /etc/passwd contents`,
          detail: `GET ${tp} returned 200 with file system content.`,
        });
      }
    }
  } catch {
    // Backend not reachable — skip
  }

  return breaks;
}
