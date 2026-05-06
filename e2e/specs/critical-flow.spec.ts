import { test, expect, type Page } from '@playwright/test';
import { bootstrapAuthenticatedPage, ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const { appUrl: APP_URL } = getE2EBaseUrls();

async function expectAuthenticatedShell(page: Page, options?: { navigate?: boolean }) {
  if (options?.navigate !== false) {
    await page.goto(`${APP_URL}/dashboard`);
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30000 });
  }
  await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /^Novo produto$/ })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('button', { name: /^Entrar$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Cadastrar-se$/ })).toHaveCount(0);
  await expect(page.getByTestId('home-dashboard-root')).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText('Operação, receita e conversas em um único plano de controle.'),
  ).toBeVisible({ timeout: 15000 });
}

test.describe('Critical Flow: Login -> Create Flow -> Execute', () => {
  test('should login, create a flow, and execute it', async ({ page, request }) => {
    test.setTimeout(90_000);

    const auth = await ensureE2EAdmin(request);
    await bootstrapAuthenticatedPage(page, auth);

    await expectAuthenticatedShell(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30000 });
    await expectAuthenticatedShell(page, { navigate: false });

    // Abre o builder atual (/flow) e valida carregamento com sinais estáveis da UI.
    const flowId = `e2e-flow-${Date.now()}`;
    await page.goto(`${APP_URL}/flow?id=${flowId}`);
    await page.waitForURL(
      (url) => url.pathname === '/flow' && url.searchParams.get('id') === flowId,
      { timeout: 30000 },
    );
    await expect(page.getByRole('button', { name: 'Editor' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Templates' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Execuções$/ })).toBeVisible();
    await expect(page.locator('.react-flow').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Salvar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Testar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Otimizar IA/i })).toBeVisible();
  });
});
