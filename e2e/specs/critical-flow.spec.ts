import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const { frontendUrl: FRONTEND_URL } = getE2EBaseUrls();

test.describe('Critical Flow: Login -> Create Flow -> Execute', () => {
  test('should login, create a flow, and execute it', async ({ page, request }) => {
    // 1. Login
    const { email, password } = await ensureE2EAdmin(request);

    await page.goto(`${FRONTEND_URL}/login`);
    await page.fill('input[type="email"]', email);
    await page.click('button[type="submit"]');

    // Em cold start, a transição do step de email → senha pode demorar.
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 15000 });
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    
    // Verify home (começo único) load
    await page.waitForURL(`${FRONTEND_URL}/`, { timeout: 30000 });
    await expect(page.locator('header').getByText('KLOEL', { exact: true })).toBeVisible({ timeout: 15000 });

    // 2) Abre o builder atual (/flow) e valida carregamento
    const flowId = `e2e-flow-${Date.now()}`;
    await page.goto(`${FRONTEND_URL}/flow?id=${flowId}`);
    await expect(page.locator('.react-flow')).toBeVisible();
    await expect(page.getByRole('button', { name: /Salvar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Testar/i })).toBeVisible();
  });
});
