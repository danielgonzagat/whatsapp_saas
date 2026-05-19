import { test, expect } from '@playwright/test';
import { bootstrapAuthenticatedPage, ensureE2EAdmin, getE2EBaseUrls } from './specs/e2e-helpers';

const { appUrl: APP_URL, apiUrl: API_URL } = getE2EBaseUrls();

test('flow test action persists the builder flow', async ({ page, request }) => {
  test.setTimeout(90_000);

  const { token, workspaceId } = await ensureE2EAdmin(request);

  await request
    .post(`${API_URL}/workspace/${workspaceId}/settings`, {
      data: { billingSuspended: false },
      headers: { authorization: `Bearer ${token}` },
    })
    .catch(() => {});
  await request
    .post(`${API_URL}/billing/activate-trial`, {
      headers: { authorization: `Bearer ${token}` },
      params: { workspaceId },
    })
    .catch(() => {});

  await bootstrapAuthenticatedPage(page, { token, workspaceId });

  const flowId = `e2e-flow-console-${Date.now()}`;
  await page.goto(`${APP_URL}/flow?id=${flowId}`);
  await page.waitForURL(
    (url) => url.pathname === '/flow' && url.searchParams.get('id') === flowId,
    { timeout: 30_000 },
  );

  await expect(page.getByRole('button', { name: 'Editor' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Testar/i })).toBeVisible();

  const saveResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/flows/save/${workspaceId}/${flowId}`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /Testar/i }).click();
  const savedByButton = await saveResponse;
  expect(savedByButton.ok()).toBeTruthy();

  const persisted = await request.get(`${API_URL}/flows/${workspaceId}/${flowId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(persisted.ok()).toBeTruthy();
  const body = await persisted.json();
  expect(body?.id).toBe(flowId);
  expect(Array.isArray(body?.nodes)).toBe(true);
  expect(Array.isArray(body?.edges)).toBe(true);

  await expect(page.getByRole('button', { name: 'Editor' })).toBeVisible();
  await expect(page.locator('.react-flow').first()).toBeVisible();
});
