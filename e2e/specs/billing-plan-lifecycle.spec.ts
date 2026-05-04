/**
 * E2E: Billing Plan Lifecycle
 *
 * Covers subscription lifecycle from the admin/user perspective:
 * get status → activate trial → check subscription → cancel & verify.
 *
 * truthMode: 'observed' — real HTTP requests against running backend.
 */
import { test, expect } from '@playwright/test';
import { bootstrapAuthenticatedPage, ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

test.describe('Billing Plan Lifecycle', () => {
  test.describe.configure({ timeout: 90_000 });

  const { apiUrl, appUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;
  let token: string;
  let workspaceId: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000);
    const session = await ensureE2EAdmin(request);
    token = session.token;
    workspaceId = session.workspaceId;
  });

  test('GET /billing/status returns plan, usage, and limit fields', async ({ request }) => {
    const res = await request.get(api('/billing/status'), {
      headers: { Authorization: `Bearer ${token}` },
      params: { workspaceId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.plan).toBeTruthy();
    expect(['active', 'trialing', 'inactive', 'past_due', 'canceled']).toContain(body.status);
    expect(body.usage).toBeTruthy();
    expect(typeof body.usage.messages).toBe('number');
    expect(typeof body.usage.limit).toBe('number');
    expect(typeof body.usage.percentage).toBe('number');
  });

  test('GET /billing/subscription returns subscription details', async ({ request }) => {
    const res = await request.get(api('/billing/subscription'), {
      headers: { Authorization: `Bearer ${token}` },
      params: { workspaceId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.plan || body.status).toBeTruthy();
  });

  test('GET /billing/usage returns usage metrics', async ({ request }) => {
    const res = await request.get(api('/billing/usage'), {
      headers: { Authorization: `Bearer ${token}` },
      params: { workspaceId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(typeof body.messages).toBe('number');
  });

  test('POST /billing/activate-trial activates trial (200 or 400 if already active)', async ({
    request,
  }) => {
    const res = await request.post(api('/billing/activate-trial'), {
      headers: { Authorization: `Bearer ${token}` },
      params: { workspaceId },
    });

    // 200 = trial activated, 400 = already active or not eligible
    expect([200, 400, 403]).toContain(res.status());
  });

  test('late subscription: GET /billing/status returns consistent shape', async ({ request }) => {
    // Verify status endpoint shape remains stable after trial activation
    const res = await request.get(api('/billing/status'), {
      headers: { Authorization: `Bearer ${token}` },
      params: { workspaceId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.plan).toBeTruthy();
    expect(body.status).toBeTruthy();
    expect(body.usage).toBeTruthy();
  });

  test('POST /billing/cancel cancels subscription (200 or 400 if not subscribed)', async ({
    request,
  }) => {
    const res = await request.post(api('/billing/cancel'), {
      headers: { Authorization: `Bearer ${token}` },
      params: { workspaceId },
    });

    // 200 = cancelled, 400 = no active subscription, 403 = not admin
    expect([200, 400, 403]).toContain(res.status());
  });

  test('POST /billing/cancel returns 401 without auth', async ({ request }) => {
    const res = await request.post(api('/billing/cancel'), {
      params: { workspaceId },
    });

    expect(res.status()).toBe(401);
  });
});
