/**
 * E2E: Customer Auth Shell
 *
 * Verifies the complete auth flow: registration → login → session validation.
 * Asserts the /workspace/me endpoint returns 200 with a valid session after auth.
 *
 * This spec is the runtime evidence for `customerPass` certification gate.
 * truthMode: 'observed' — real HTTP requests against a running backend.
 */
import { test, expect } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { getE2EBaseUrls } from './e2e-helpers';

const TEST_USER_PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass123!';

test.describe('Customer Auth Shell', () => {
  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;

  test('register → login → session returns /workspace/me 200', async ({ request }) => {
    const email = `e2e_customer_auth_${Date.now()}_${randomInt(1_000_000_000)}@example.com`;
    const password = TEST_USER_PASSWORD;

    // 1. Register
    const regRes = await request.post(api('/auth/register'), {
      data: { name: 'E2E Customer', email, password, workspaceName: 'E2E Customer Workspace' },
    });
    expect([200, 201]).toContain(regRes.status());
    const regBody = await regRes.json();
    const accessToken = regBody.access_token as string;
    expect(accessToken).toBeTruthy();

    // 2. Login
    const loginRes = await request.post(api('/auth/login'), {
      data: { email, password },
    });
    expect([200, 201]).toContain(loginRes.status());
    const loginBody = await loginRes.json();
    expect(loginBody.access_token).toBeTruthy();

    // 3. Validate session via /workspace/me
    const meRes = await request.get(api('/workspace/me'), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    // /workspace/me MUST resolve to a real workspace association. A user
    // without a workspace cannot use the product, so accept only the
    // workspace id (top-level Workspace row, or nested .workspace.id).
    const workspaceId = meBody.id || meBody.workspace?.id;
    expect(workspaceId).toBeTruthy();
  });

  test('invalid token returns 401 on /workspace/me', async ({ request }) => {
    const meRes = await request.get(api('/workspace/me'), {
      headers: { Authorization: 'Bearer invalid_token_12345' },
    });
    expect(meRes.status()).toBe(401);
  });

  test('missing credentials returns 400 on register', async ({ request }) => {
    const res = await request.post(api('/auth/register'), {
      data: { name: 'No Password', email: `bad_${Date.now()}@example.com` },
    });
    expect(res.status()).toBe(400);
  });
});
