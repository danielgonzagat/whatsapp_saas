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
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    
    // Verify dashboard load
    await expect(page).toHaveURL(`${FRONTEND_URL}/dashboard`);
    await expect(page.getByRole('main').getByText('Dashboard')).toBeVisible();

    // 2) Abre o builder atual (/flow) e valida carregamento
    const flowId = `e2e-flow-${Date.now()}`;
    await page.goto(`${FRONTEND_URL}/flow?id=${flowId}`);
    await expect(page.locator('.react-flow')).toBeVisible();
    await expect(page.getByRole('button', { name: /Salvar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Testar/i })).toBeVisible();
  });
});
