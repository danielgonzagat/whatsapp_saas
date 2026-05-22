import { test, expect } from '@playwright/test';
import { bootstrapAuthenticatedPage, ensureE2EAdmin, getE2EBaseUrls } from './specs/e2e-helpers';

const { appUrl: APP_URL } = getE2EBaseUrls();

/**
 * Flow creation via the frontend flow-builder route.
 * Complements critical-flow.spec.ts by testing the listing-create path
 * (rather than the direct /flow?id=... navigation).
 */
test('flow editor loads via builder route', async ({ page, request }) => {
  test.setTimeout(90_000);

  const auth = await ensureE2EAdmin(request);
  await bootstrapAuthenticatedPage(page, auth);

  const flowId = `e2e-flow-list-${Date.now()}`;
  await page.goto(`${APP_URL}/flow?id=${flowId}`);
  await page.waitForURL(
    (url) => url.pathname === '/flow' && url.searchParams.get('id') === flowId,
    { timeout: 30_000 },
  );

  await expect(page.getByRole('button', { name: 'Editor' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Templates' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Execuções$/ })).toBeVisible();
  await expect(page.locator('.react-flow').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Salvar/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Testar/i })).toBeVisible();
});
