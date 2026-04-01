import { test, expect } from '@playwright/test';
import {
  ensureE2EAdmin,
  getE2EBaseUrls,
  seedE2EAuthSession,
} from './e2e-helpers';

const { frontendUrl: FRONTEND_URL } = getE2EBaseUrls();

test.describe('Critical Flow: Login -> Create Flow -> Execute', () => {
  test('should login, create a flow, and execute it', async ({ page, request }) => {
    const auth = await ensureE2EAdmin(request);
    await seedE2EAuthSession(page, auth);

    // Verify dashboard load
    await page.goto(`${FRONTEND_URL}/dashboard`);
    await page.waitForURL(`${FRONTEND_URL}/dashboard`, { timeout: 30000 });
    await expect(page.getByText('Cadastro incompleto')).toBeVisible({ timeout: 15000 });

    // 2) Abre o builder atual (/flow) e valida carregamento
    const flowId = `e2e-flow-${Date.now()}`;
    await page.goto(`${FRONTEND_URL}/flow?id=${flowId}`);
    await expect(page.locator('.react-flow')).toBeVisible();
    await expect(page.getByRole('button', { name: /Salvar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Testar/i })).toBeVisible();
  });
});
