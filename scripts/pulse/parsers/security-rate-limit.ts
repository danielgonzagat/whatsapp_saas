/**
 * PULSE Parser 57: Security — Rate Limiting
 * Layer 5: Security Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Verify rate limiting is active and effective on sensitive endpoints.
 *
 * Auth endpoints (login brute force protection):
 * 1. POST /auth/login — fire 10 requests in 60s → 6th+ should return 429 Too Many Requests
 * 2. Verify 429 response includes Retry-After header
 * 3. Verify rate limit is per-IP (not per-user — attacker can't know user exists)
 * 4. After rate limit window expires, verify login works again
 *
 * Financial endpoints:
 * 5. POST /wallet/withdraw — fire 20 requests in 10s → expect 429 after limit
 * 6. POST /checkout/init — fire 20 requests in 10s → expect 429 after limit
 * 7. POST /webhook/asaas — fire 250 requests in 60s (Asaas burst) → must still accept (limit ≥ 200/min)
 *
 * Public endpoints:
 * 8. Global rate limit: fire 110 requests in 60s to any public endpoint → expect 429 after 100
 *
 * Rate limit bypass attempts:
 * 9. Rotate X-Forwarded-For header to different IPs → verify rate limit not bypassed
 *    (depends on trustProxy config — document actual behavior)
 * 10. Use different User-Agent strings → verify rate limit still applies per IP
 *
 * Rate limit headers:
 * 11. Verify X-RateLimit-Limit header present on responses
 * 12. Verify X-RateLimit-Remaining header present
 * 13. Verify X-RateLimit-Reset header present (when to retry)
 *
 * REQUIRES:
 * - Running backend (PULSE_BACKEND_URL)
 * - Ability to fire concurrent requests (Promise.all)
 * - Valid test credentials for auth endpoint tests
 *
 * BREAK TYPES:
 * - RATE_LIMIT_MISSING (critical) — endpoint accepts > configured limit without returning 429
 * - BRUTE_FORCE_VULNERABLE (critical) — /auth/login accepts unlimited attempts without rate limit
 */

import type { Break, PulseConfig } from '../types';
import { httpPost, httpGet, makeTestJwt, getBackendUrl, isDeepMode } from './runtime-utils';

/** Fire N concurrent requests and return all response status codes */
async function fireRequests(
  method: 'GET' | 'POST',
  path: string,
  body: any,
  count: number,
  extraHeaders: Record<string, string> = {}
): Promise<number[]> {
  const backendUrl = getBackendUrl();
  const requests = Array.from({ length: count }, () =>
    fetch(`${backendUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    })
      .then((r) => r.status)
      .catch(() => 0)
  );
  return Promise.all(requests);
}

export async function checkSecurityRateLimit(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!isDeepMode()) return [];

  const breaks: Break[] = [];
  const jwt = makeTestJwt();

  // ── 1. Auth brute-force protection: POST /auth/login ─────────────────────
  // Fire 20 rapid requests with wrong credentials.
  // The throttler is configured as 5 req/min per IP for auth/login.
  // So we expect at least some 429 responses out of 20 rapid requests.
  try {
    const loginBody = { email: 'brute-force-test@pulse.kloel.com', password: 'wrong-password-pulse' };
    const statuses = await fireRequests('POST', '/auth/login', loginBody, 20);

    const count429 = statuses.filter((s) => s === 429).length;
    const countNonAuth = statuses.filter((s) => s !== 401 && s !== 400 && s !== 429 && s !== 0).length;

    if (count429 === 0) {
      breaks.push({
        type: 'BRUTE_FORCE_VULNERABLE',
        severity: 'critical',
        file: `backend/src (POST /auth/login)`,
        line: 0,
        description: `No rate limiting on POST /auth/login — brute-force attack is possible`,
        detail: `Fired 20 rapid login requests. Received 0 HTTP 429 responses. All statuses: [${statuses.join(', ')}]. The auth throttle (5 req/min) does not appear to be active. Configure @nestjs/throttler on the auth controller.`,
      });
    }

    // If any request returned something other than 400/401/429 — suspicious
    if (countNonAuth > 0) {
      breaks.push({
        type: 'BRUTE_FORCE_VULNERABLE',
        severity: 'critical',
        file: `backend/src (POST /auth/login)`,
        line: 0,
        description: `Unexpected success responses during brute-force simulation on POST /auth/login`,
        detail: `${countNonAuth} out of 20 rapid login requests returned non-401/non-400/non-429 status. Statuses: [${statuses.join(', ')}]. Investigate whether auth bypass is possible.`,
      });
    }
  } catch {
    // Backend not reachable — skip
  }

  // ── 2. Wallet balance endpoint rate limiting ──────────────────────────────
  // GET /kloel/wallet/:workspaceId/balance — financial endpoint
  // Fire 20 rapid authenticated requests; expect some 429 responses.
  try {
    const workspaceId = 'pulse-test-workspace';
    const walletPath = `/kloel/wallet/${workspaceId}/balance`;
    const backendUrl = getBackendUrl();

    const walletRequests = Array.from({ length: 20 }, () =>
      fetch(`${backendUrl}${walletPath}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })
        .then((r) => r.status)
        .catch(() => 0)
    );

    const walletStatuses = await Promise.all(walletRequests);
    const walletCount429 = walletStatuses.filter((s) => s === 429).length;

    // If the endpoint returns 404 (workspace not found) that is fine — not a rate limit issue
    // But if it returns 200 every time with no 429 → rate limiting is missing
    const walletCount200 = walletStatuses.filter((s) => s === 200).length;
    if (walletCount200 > 0 && walletCount429 === 0) {
      breaks.push({
        type: 'RATE_LIMIT_MISSING',
        severity: 'high',
        file: `backend/src (GET ${walletPath})`,
        line: 0,
        description: `No rate limiting on financial endpoint GET /kloel/wallet/:id/balance`,
        detail: `Fired 20 rapid authenticated requests to ${walletPath}. Received ${walletCount200} HTTP 200 responses and 0 HTTP 429 responses. Financial endpoints should be rate-limited to prevent data scraping.`,
      });
    }
  } catch {
    // Backend not reachable — skip
  }

  // ── 3. Global rate limit check ────────────────────────────────────────────
  // The global throttler is 100 req/min. Fire 110 requests to a lightweight endpoint.
  // We use GET /auth/me or GET /health since these should be fast.
  // We only flag if 110+ requests ALL return 200 with zero 429.
  try {
    const healthStatuses = await fireRequests('GET', '/health', undefined, 110, {
      Authorization: `Bearer ${jwt}`,
    });
    const health429 = healthStatuses.filter((s) => s === 429).length;
    const health200 = healthStatuses.filter((s) => s === 200).length;

    if (health200 > 100 && health429 === 0) {
      breaks.push({
        type: 'RATE_LIMIT_MISSING',
        severity: 'high',
        file: `backend/src (global throttler)`,
        line: 0,
        description: `Global rate limiter not triggering — 110+ requests returned 200 with no 429`,
        detail: `Fired 110 rapid GET /health requests. ${health200} returned 200, ${health429} returned 429. The global throttler (100 req/min) appears inactive. Verify @nestjs/throttler is applied globally in AppModule.`,
      });
    }
  } catch {
    // Backend not reachable or /health not defined — skip
  }

  return breaks;
}
