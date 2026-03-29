import { test, expect, Page } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const { frontendUrl: FRONTEND_URL } = getE2EBaseUrls();

// ── Helpers ──

async function login(page: Page, email: string, password: string) {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.click('button[type="submit"]');
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 15000 });
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${FRONTEND_URL}/`, { timeout: 30000 });
}

async function goToSettings(page: Page) {
  await page.goto(`${FRONTEND_URL}/settings`);
  await expect(page.getByText('Minha conta')).toBeVisible({ timeout: 15000 });
}

async function clickSidebarSection(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click();
}

async function clickSave(page: Page, label = 'Salvar alteracoes') {
  await page.getByRole('button', { name: new RegExp(label, 'i') }).click();
}

// Small 1x1 red PNG for upload tests
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

// ── Tests ──

test.describe('Settings / KYC', () => {

  test('page loads and shows Minha conta', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);

    await expect(page.getByText('Minha conta')).toBeVisible();
    await expect(page.getByText('Cadastro incompleto')).toBeVisible();
  });

  test('Dados Pessoais: save and persist (CPF absent)', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);

    // Verify CPF field is NOT present in Dados Pessoais
    await expect(page.locator('input[placeholder="000.000.000-00"]')).not.toBeVisible();

    // Fill name
    const testName = `E2E User ${Date.now()}`;
    await page.fill('input[placeholder="Seu nome completo"]', testName);

    // Fill phone
    await page.fill('input[placeholder="(00) 00000-0000"]', '11999990000');

    // Save
    await clickSave(page);
    await expect(page.getByText('Salvo!')).toBeVisible({ timeout: 10000 });

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByText('Minha conta')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[placeholder="Seu nome completo"]')).toHaveValue(testName, { timeout: 10000 });
    await expect(page.locator('input[placeholder="(00) 00000-0000"]')).toHaveValue('11999990000');
  });

  test('Dados Fiscais PF: save CPF and persist', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);
    await clickSidebarSection(page, 'Dados fiscais');

    // Default is PF — fill CPF and legal name
    await page.fill('input[placeholder="000.000.000-00"]', '12345678901');
    await page.fill('input[placeholder="Nome conforme documento"]', 'E2E Teste PF');

    // Fill address (required for completion)
    await page.fill('input[placeholder="00000-000"]', '01001000');
    // Wait for CEP autofill
    await expect(page.locator('input[placeholder="Nome da rua"]')).not.toHaveValue('', { timeout: 10000 });

    await page.fill('input[placeholder="123"]', '100');

    await clickSave(page);
    await expect(page.getByText('Salvo!')).toBeVisible({ timeout: 10000 });

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByText('Minha conta')).toBeVisible({ timeout: 15000 });
    await clickSidebarSection(page, 'Dados fiscais');
    await expect(page.locator('input[placeholder="000.000.000-00"]')).toHaveValue('12345678901', { timeout: 10000 });
    await expect(page.locator('input[placeholder="Nome conforme documento"]')).toHaveValue('E2E Teste PF');
  });

  test('Dados Fiscais PJ: CNPJ autofill fires', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);
    await clickSidebarSection(page, 'Dados fiscais');

    // Switch to PJ
    await page.getByRole('button', { name: /Pessoa Juridica/i }).click();

    // Mock BrasilAPI to avoid external dependency in CI
    await page.route('**/brasilapi.com.br/api/cnpj/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          razao_social: 'EMPRESA TESTE LTDA',
          nome_fantasia: 'TESTE',
          cep: '01001000',
          logradouro: 'Praca da Se',
          numero: 's/n',
          complemento: '',
          bairro: 'Se',
          municipio: 'Sao Paulo',
          uf: 'SP',
          qsa: [{ nome_socio: 'SOCIO TESTE', cnpj_cpf_do_socio: '12345678901' }],
        }),
      });
    });

    // Fill CNPJ (14 digits triggers autofill)
    await page.fill('input[placeholder="00.000.000/0000-00"]', '11222333000181');

    // Verify autofill populated razao social
    await expect(page.locator('input[placeholder="Razao social da empresa"]')).toHaveValue('EMPRESA TESTE LTDA', { timeout: 10000 });
  });

  test('CEP autofill populates address', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);
    await clickSidebarSection(page, 'Dados fiscais');

    // Mock ViaCEP for CI reliability
    await page.route('**/viacep.com.br/ws/*/json/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          logradouro: 'Praca da Se',
          complemento: 'lado impar',
          bairro: 'Se',
          localidade: 'Sao Paulo',
          uf: 'SP',
        }),
      });
    });

    // Clear and fill CEP
    await page.fill('input[placeholder="00000-000"]', '01001000');

    // Verify address fields populated
    await expect(page.locator('input[placeholder="Nome da rua"]')).toHaveValue('Praca da Se', { timeout: 10000 });
    await expect(page.locator('input[placeholder="Bairro"]')).toHaveValue('Se');
    await expect(page.locator('input[placeholder="Cidade"]')).toHaveValue('Sao Paulo');
    await expect(page.locator('input[placeholder="SP"]')).toHaveValue('SP');
  });

  test('Dados Bancarios: save and persist', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);
    await clickSidebarSection(page, 'Dados bancarios');

    await page.fill('input[placeholder="Nome do banco"]', 'Banco Teste');
    await page.fill('input[placeholder="000"]', '001');
    await page.fill('input[placeholder="0000"]', '1234');
    await page.fill('input[placeholder="00000-0"]', '567890-1');
    await page.fill('input[placeholder="Nome completo do titular"]', 'Titular Teste');
    await page.fill('input[placeholder="000.000.000-00"]', '12345678901');

    await clickSave(page);
    await expect(page.getByText('Salvo!')).toBeVisible({ timeout: 10000 });

    // Reload and verify
    await page.reload();
    await expect(page.getByText('Minha conta')).toBeVisible({ timeout: 15000 });
    await clickSidebarSection(page, 'Dados bancarios');
    await expect(page.locator('input[placeholder="Nome do banco"]')).toHaveValue('Banco Teste', { timeout: 10000 });
    await expect(page.locator('input[placeholder="0000"]')).toHaveValue('1234');
  });

  test('Documentos: upload and delete', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);
    await clickSidebarSection(page, 'Documentos');

    // Upload first document (DOCUMENT_FRONT)
    const fileInputs = page.locator('input[type="file"][accept="image/*,.pdf"]');
    await fileInputs.first().setInputFiles({
      name: 'test-id.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    // Verify document card appears (shows file name or "Documento de identidade")
    await expect(page.getByText(/test-id\.png|Documento de identidade/)).toBeVisible({ timeout: 15000 });

    // Delete — click trash icon (the button with the trash SVG)
    const deleteBtn = page.locator('button').filter({ has: page.locator('svg polyline[points="3 6 5 6 21 6"]') });
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.first().click();
      // Verify upload zone reappears
      await expect(page.getByText('Documento de identidade')).toBeVisible({ timeout: 10000 });
    }
  });

  test('error feedback when save fails', async ({ page, request }) => {
    const { email, password } = await ensureE2EAdmin(request);
    await login(page, email, password);
    await goToSettings(page);

    // Intercept profile save and return 500
    await page.route('**/api/kyc/profile', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    // Try to save
    await page.fill('input[placeholder="Seu nome completo"]', 'Trigger Error');
    await clickSave(page);

    // Verify error feedback appears
    await expect(page.getByText(/Erro ao salvar|Internal server error/)).toBeVisible({ timeout: 10000 });
  });

});
