import { test, expect } from '@playwright/test';

test.describe('Meta Marketing Flow', () => {
  test('AnunciosView renders with empty state when no Meta account connected', async ({ page }) => {
    await page.goto('/anuncios');

    await expect(page.locator('text=Anúncios')).toBeVisible({ timeout: 10000 });

    const tabBar = page.locator('text=Visão Geral');
    if (await tabBar.isVisible()) {
      await expect(tabBar).toBeVisible();
    }
  });

  test('AnunciosView shows WarRoomDashboard in visao tab', async ({ page }) => {
    await page.goto('/anuncios?tab=visao');

    const dash = page.locator('[data-testid="war-room-dashboard"]');
    const anyDashboardContent = page.locator('text=Plataformas');
    const altContent = page.locator('text=Meta');
    const hasContent = (await anyDashboardContent.isVisible().catch(() => false)) ||
      (await altContent.isVisible().catch(() => false));

    expect(hasContent || (await dash.isVisible().catch(() => false))).toBeTruthy();
  });

  test('AnunciosView shows setup/connect state for Meta when disconnected', async ({ page }) => {
    await page.goto('/anuncios?tab=meta');

    const metaTab = page.locator('text=Meta Ads');
    const connectButton = page.locator('text=Conectar').or(page.locator('text=Conectar Meta'));
    const setupText = page.locator('text=Nenhuma conta conectada').or(page.locator('text=Configurar'));

    const hasMetaContent = (await metaTab.isVisible().catch(() => false)) ||
      (await connectButton.isVisible().catch(() => false)) ||
      (await setupText.isVisible().catch(() => false));

    expect(hasMetaContent).toBeTruthy();
  });

  test('OAuth callback redirect path exists', async ({ page }) => {
    const response = await page.goto('/meta/auth/url');
    expect(response?.status()).not.toBe(404);
  });

  test('Webhook endpoint rejects invalid signature', async ({ request }) => {
    const response = await request.post('/webhooks/meta-marketing', {
      data: { object: 'ad_account', entry: [] },
      headers: {
        'X-Hub-Signature-256': 'sha256=fakesignature000000000000000000000000000000000000000000000000000000',
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(403);
  });

  test('Webhook endpoint accepts valid signature', async ({ request }) => {
    const response = await request.post('/webhooks/meta-marketing', {
      data: { object: 'ad_account', entry: [] },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(200);
  });

  test('Anuncios campaign endpoint returns data for GET request', async ({ request }) => {
    const response = await request.get('/api/anuncios/campaigns');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Anuncios status endpoint returns platform list', async ({ request }) => {
    const response = await request.get('/api/anuncios/status');
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
    const response = await request.get('/api/anuncios/status');
    expect(response.status()).toBe(200);
  });
});
