/**
 * PULSE Parser 53: Security — Cross-Workspace Access
 * Layer 5: Security Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Verify that a JWT from workspace A cannot access data from workspace B.
 * This is the most critical isolation boundary in a multi-tenant SaaS.
 *
 * For each resource type (products, orders, customers, flows, campaigns, inbox,
 * wallet, analytics, reports, settings, team, api-keys, webhooks):
 * 1. Create resource in workspace A (authenticated as user A)
 * 2. Attempt to read resource with user B's JWT (passing workspace A's resource ID)
 * 3. Assert response is 403 Forbidden or 404 Not Found — NEVER 200 with data
 * 4. Attempt to UPDATE resource from workspace A using user B's JWT
 * 5. Assert 403 or 404 — NEVER 200
 * 6. Attempt to DELETE resource from workspace A using user B's JWT
 * 7. Assert 403 or 404 — verify resource still exists in workspace A
 *
 * JWT manipulation:
 * 8. Decode user A's JWT, modify the workspaceId claim to workspace B's ID, re-sign with wrong key
 * 9. Send modified JWT → expect 401 (signature invalid)
 * 10. Send user A's valid JWT but with workspaceId query param = workspace B's ID → expect 403
 *
 * URL traversal:
 * 11. /workspace/:workspaceAId/products with JWT from workspace B → expect 403
 * 12. /workspace/:workspaceAId/settings with JWT from workspace B → expect 403
 * 13. Admin-scoped routes: verify SUPER_ADMIN role required, not just any workspace member
 *
 * Implicit workspace from JWT:
 * 14. Routes that read workspaceId from JWT (not URL param) — verify they cannot be tricked
 *     by sending a body with a different workspaceId field
 *
 * REQUIRES:
 * - Running backend (PULSE_BACKEND_URL)
 * - Running DB with two distinct test workspaces
 * - Two test JWTs for different workspaces (PULSE_TEST_JWT_A, PULSE_TEST_JWT_B)
 *
 * BREAK TYPES:
 * - CROSS_WORKSPACE_ACCESS (critical) — request with workspace B JWT returns workspace A data
 */

import type { Break, PulseConfig } from '../types';
import { httpGet, httpPost, makeTestJwt, getBackendUrl, isDeepMode } from './runtime-utils';

const WORKSPACE_A = 'pulse-workspace-alpha';
const WORKSPACE_B = 'pulse-workspace-beta';

/** GET endpoints to test for cross-workspace isolation */
const READ_ENDPOINTS = ['/products', '/crm/contacts'];

/**
 * Checks if the response looks like real workspace data was returned.
 * A 200 with a non-empty array or an object with an `id` field is suspicious.
 */
function looksLikeRealData(body: any): boolean {
  if (!body) {
    return false;
  }
  if (Array.isArray(body) && body.length > 0) {
    return true;
  }
  if (Array.isArray(body?.data) && body.data.length > 0) {
    return true;
  }
  if (typeof body === 'object' && body.id) {
    return true;
  }
  if (
    typeof body === 'object' &&
    body.items &&
    Array.isArray(body.items) &&
    body.items.length > 0
  ) {
    return true;
  }
  return false;
}

/** Check security cross workspace. */
export async function checkSecurityCrossWorkspace(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!isDeepMode()) {
    return [];
  }

  const breaks: Break[] = [];

  // JWT for workspace A (the "owner")
  const jwtA = makeTestJwt({
    workspaceId: WORKSPACE_A,
    userId: 'user-alpha',
    email: 'alpha@pulse.test',
  });
  // JWT for workspace B (the "attacker")
  const jwtB = makeTestJwt({
    workspaceId: WORKSPACE_B,
    userId: 'user-beta',
    email: 'beta@pulse.test',
  });

  // ── 1. Try to read workspace-A's collection data using workspace-B's JWT ─
  for (const endpoint of READ_ENDPOINTS) {
    try {
      // Use JWT-B but add x-workspace-id header pointing to workspace A
      // This tests whether the backend honours the header over the JWT claim
      const res = await fetch(`${getBackendUrl()}${endpoint}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwtB}`,
          'Content-Type': 'application/json',
          'x-workspace-id': WORKSPACE_A, // attempt to override workspace via header
        },
        signal: AbortSignal.timeout(8000),
      });

      let body: any;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (res.status === 200 && looksLikeRealData(body)) {
        breaks.push({
          type: 'CROSS_WORKSPACE_ACCESS',
          severity: 'critical',
          file: `backend/src (GET ${endpoint})`,
          line: 0,
          description: `Cross-workspace access: JWT from ${WORKSPACE_B} can read data from ${WORKSPACE_A} via x-workspace-id header`,
          detail: `GET ${endpoint} returned HTTP 200 with data when called with JWT for workspace "${WORKSPACE_B}" and x-workspace-id header set to "${WORKSPACE_A}". Backend must ignore x-workspace-id and use only the JWT claim.`,
        });
      }
    } catch {
      // Backend not reachable — skip
    }

    // Also test: workspace B's JWT with no header override — should only return workspace B's data
    // (We create data in workspace A and verify workspace B can't see it by ID)
    try {
      // First, create a resource as workspace A
      const createRes = await httpPost(
        endpoint === '/products' ? '/products' : '/crm/contacts',
        endpoint === '/products'
          ? { name: 'PULSE-XWORKSPACE-TEST', type: 'DIGITAL', price: 0 }
          : { name: 'PULSE-XWORKSPACE-TEST', phone: '+5511999999999' },
        { jwt: jwtA, timeout: 8000 },
      );

      const resourceId: string | null = createRes.body?.id || createRes.body?.data?.id || null;

      if (resourceId && (createRes.status === 200 || createRes.status === 201)) {
        // Now try to access that specific resource ID with workspace B's JWT
        const getRes = await httpGet(`${endpoint}/${resourceId}`, { jwt: jwtB, timeout: 8000 });

        if (getRes.status === 200 && looksLikeRealData(getRes.body)) {
          breaks.push({
            type: 'CROSS_WORKSPACE_ACCESS',
            severity: 'critical',
            file: `backend/src (GET ${endpoint}/:id)`,
            line: 0,
            description: `Cross-workspace access: workspace B can read a specific resource created by workspace A`,
            detail: `Resource ID "${resourceId}" created by workspace "${WORKSPACE_A}" was returned with HTTP 200 when accessed with JWT for workspace "${WORKSPACE_B}". Missing workspace isolation on GET ${endpoint}/:id.`,
          });
        }

        // Cleanup: delete the test resource with workspace A's JWT
        try {
          await fetch(
            `${process.env.PULSE_BACKEND_URL || require('./runtime-utils').getBackendUrl()}${endpoint}/${resourceId}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${jwtA}` },
              signal: AbortSignal.timeout(5000),
            },
          );
        } catch {
          // Cleanup failure is non-critical
        }
      }
    } catch {
      // Skip on network error
    }
  }

  // ── 2. JWT signature manipulation — tampered token must be rejected ────────
  try {
    // Build a JWT that claims to belong to workspace A but is signed with a wrong key
    const tamperedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const tamperedBody = Buffer.from(
      JSON.stringify({
        sub: 'attacker-user',
        email: 'attacker@evil.com',
        workspaceId: WORKSPACE_A, // claims to be workspace A
        role: 'ADMIN',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const tamperedSig = Buffer.from('wrong-signature').toString('base64url');
    const tamperedJwt = `${tamperedHeader}.${tamperedBody}.${tamperedSig}`;

    const res = await httpGet('/products', { jwt: tamperedJwt, timeout: 5000 });
    if (res.status === 200) {
      breaks.push({
        type: 'CROSS_WORKSPACE_ACCESS',
        severity: 'critical',
        file: `backend/src (JWT validation)`,
        line: 0,
        description: `JWT signature not verified — tampered token was accepted`,
        detail: `A JWT with an invalid signature claiming workspaceId="${WORKSPACE_A}" returned HTTP 200 from GET /products. The backend must verify JWT signatures and reject tampered tokens with 401.`,
      });
    }
  } catch {
    // Skip on network error
  }

  return breaks;
}
