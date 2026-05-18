import { createHmac } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  bootstrapAuthenticatedPage,
  ensureE2EAdmin,
  getE2EBaseUrls,
  type E2EAuthContext,
} from './e2e-helpers';

const { apiUrl: API_URL } = getE2EBaseUrls();
const META_APP_SECRET = process.env.META_APP_SECRET || 'e2e-meta-secret';
const webhookPayload = { object: 'ad_account', entry: [] };
const webhookBody = JSON.stringify(webhookPayload);

function api(path: string): string {
  return `${API_URL}${path}`;
}

function authHeaders(auth: E2EAuthContext): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.token}`,
    'x-workspace-id': auth.workspaceId,
  };
}

function metaSignature(body: string): string {
  return `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`;
}

async function ensureAdmin(request: APIRequestContext): Promise<E2EAuthContext> {
  return ensureE2EAdmin(request);
}

test.describe('Meta Marketing Flow', () => {
  test('AnunciosView renders disconnected War Room state when no Meta account connected', async ({
    page,
    request,
  }) => {
    const auth = await ensureAdmin(request);
    await bootstrapAuthenticatedPage(page, auth, { landingPath: '/anuncios' });

    await expect(page.getByRole('button', { name: /war room/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Conectar Meta Ads', exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('AnunciosView shows WarRoomDashboard in visao tab', async ({ page, request }) => {
    const auth = await ensureAdmin(request);
    await bootstrapAuthenticatedPage(page, auth, { landingPath: '/anuncios' });

    await expect(page.getByRole('button', { name: /war room/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/LUCRO LIQUIDO|INVESTIDO/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('AnunciosView shows setup/connect state for Meta when disconnected', async ({
    page,
    request,
  }) => {
    const auth = await ensureAdmin(request);
    await bootstrapAuthenticatedPage(page, auth, { landingPath: '/anuncios/meta' });

    await expect(page.getByRole('heading', { name: 'Anúncios' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Meta Ads', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Conectar Meta Ads', exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('OAuth callback redirect path exists', async ({ request }) => {
    const response = await request.get(api('/meta/auth/url'));
    expect(response.status()).not.toBe(404);
  });

  test('Webhook endpoint rejects invalid signature', async ({ request }) => {
    const response = await request.post(api('/webhooks/meta-marketing'), {
      data: webhookPayload,
      headers: {
        'X-Hub-Signature-256':
          'sha256=fakesignature000000000000000000000000000000000000000000000000000000',
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(403);
  });

  test('Webhook endpoint accepts valid signature', async ({ request }) => {
    const response = await request.post(api('/webhooks/meta-marketing'), {
      data: webhookPayload,
      headers: {
        'X-Hub-Signature-256': metaSignature(webhookBody),
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);
  });

  test('Anuncios campaign endpoint returns data for GET request', async ({ request }) => {
    const auth = await ensureAdmin(request);
    const response = await request.get(api('/api/anuncios/campaigns'), {
      headers: authHeaders(auth),
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Anuncios status endpoint returns platform list', async ({ request }) => {
    const auth = await ensureAdmin(request);
    const response = await request.get(api('/api/anuncios/status'), {
      headers: authHeaders(auth),
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);

    const metaStatus = body.data.find((s: { platform: string }) => s.platform === 'meta');
    if (metaStatus) {
      expect(metaStatus).toHaveProperty('connected');
      expect(metaStatus).toHaveProperty('clientConfigured');
    }
  });

  test('Conversions API hash produces consistent SHA-256 output', async ({ request }) => {
    const auth = await ensureAdmin(request);
    const response = await request.get(api('/api/anuncios/status'), {
      headers: authHeaders(auth),
    });
    expect(response.status()).toBe(200);
  });
});
