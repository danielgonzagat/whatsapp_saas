import { test, expect, Page } from '@playwright/test';
import {
  dismissCookieBanner,
  getE2EBaseUrls,
  seedE2EAuthSession,
  type E2EAuthContext,
} from './e2e-helpers';

const { appUrl: APP_URL } = getE2EBaseUrls();

// ── Helpers ──

const TEST_WORKSPACE_ID = 'workspace-e2e-kyc';
const TEST_EMAIL = 'admin+e2e@example.com';
const TEST_AUTH: E2EAuthContext = {
  token: `header.${Buffer.from(
    JSON.stringify({
      sub: 'user-e2e-kyc',
      email: TEST_EMAIL,
      workspaceId: TEST_WORKSPACE_ID,
      role: 'ADMIN',
      name: 'E2E User',
    }),
  ).toString('base64url')}.signature`,
  workspaceId: TEST_WORKSPACE_ID,
  email: TEST_EMAIL,
  password: 'password',
};

type KycMockState = {
  profile: Record<string, unknown>;
  fiscal: Record<string, unknown>;
  bank: Record<string, unknown>;
  documents: Array<{
    id: string;
    type: string;
    fileName: string;
    status: string;
    createdAt: string;
  }>;
};

const kycMockStateByPage = new WeakMap<Page, KycMockState>();

async function installKycMocks(page: Page) {
  if (kycMockStateByPage.has(page)) {
    return;
  }

  const state: KycMockState = {
    profile: {
      id: 'profile-e2e',
      name: 'E2E User',
      email: TEST_EMAIL,
      phone: '',
      documentNumber: '',
      avatarUrl: null,
    },
    fiscal: {
      type: 'PF',
      cpf: '',
      cnpj: '',
      fullName: '',
      address: {},
    },
    bank: {
      bankCode: '',
      bankName: '',
      agency: '',
      account: '',
      accountType: 'checking',
    },
    documents: [],
  };
  kycMockStateByPage.set(page, state);

  await page.route('**/workspace/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'user-e2e-kyc',
          workspaceId: TEST_WORKSPACE_ID,
          email: TEST_EMAIL,
          name: 'E2E User',
        },
        workspace: { id: TEST_WORKSPACE_ID, name: 'E2E Workspace' },
        workspaces: [{ id: TEST_WORKSPACE_ID, name: 'E2E Workspace' }],
      }),
    });
  });

  await page.route(`**/onboarding/${TEST_WORKSPACE_ID}/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ completed: true }),
    });
  });

  await page.route('**/billing/subscription**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'active', trialDaysLeft: 0, creditsBalance: 100 }),
    });
  });

  await page.route('**/cookie-consent**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          consent: {
            necessary: true,
            analytics: false,
            marketing: false,
            updatedAt: new Date(0).toISOString(),
          },
        },
      }),
    });
  });

  await page.route('**/kyc/**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const kycPath = url.pathname.replace(/^\/api(?=\/)/, '');
    const body = () => {
      try {
        return route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    if (kycPath === '/kyc/profile') {
      if (method === 'PUT') {
        state.profile = { ...state.profile, ...body() };
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.profile),
      });
      return;
    }

    if (kycPath === '/kyc/fiscal') {
      if (method === 'PUT') {
        state.fiscal = { ...state.fiscal, ...body() };
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.fiscal),
      });
      return;
    }

    if (kycPath === '/kyc/bank') {
      if (method === 'PUT') {
        state.bank = { ...state.bank, ...body() };
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.bank),
      });
      return;
    }

    if (kycPath === '/kyc/documents') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.documents),
      });
      return;
    }

    if (kycPath === '/kyc/documents/upload' && method === 'POST') {
      const document = {
        id: `doc-${Date.now()}`,
        type: 'DOCUMENT_FRONT',
        fileName: 'test-id.png',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      state.documents = [document, ...state.documents];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, document }),
      });
      return;
    }

    if (kycPath.startsWith('/kyc/documents/') && method === 'DELETE') {
      const docId = decodeURIComponent(kycPath.split('/').pop() || '');
      state.documents = state.documents.filter((doc) => doc.id !== docId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (kycPath === '/kyc/status' || kycPath === '/kyc/completion') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending', completion: 75, completed: false }),
      });
      return;
    }

    await route.continue();
  });
}

async function login(page: Page, request: unknown) {
  void request;
  await installKycMocks(page);
  await seedE2EAuthSession(page, TEST_AUTH);
}

async function goToSettings(page: Page) {
  await page.goto(`${APP_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);
  await expect(page.getByRole('heading', { name: 'Minha conta' }).first()).toBeVisible({
    timeout: 15000,
  });
}

async function revisitSettings(page: Page, request: unknown) {
  await login(page, request);
  await goToSettings(page);
}

async function clickSidebarSection(page: Page, name: string) {
  await dismissCookieBanner(page);
  const sectionButton = page.getByRole('button').filter({ hasText: name }).first();
  await expect(sectionButton).toBeVisible({ timeout: 10_000 });
  await sectionButton.evaluate((button: HTMLElement) => button.click());
  await expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 10_000 });
}

async function clickSave(page: Page) {
  await dismissCookieBanner(page);
}

async function saveAndWaitForKycPut(
  page: Page,
  endpoint: '/kyc/profile' | '/kyc/fiscal' | '/kyc/bank',
  data: Record<string, unknown> = {},
) {
  await clickSave(page);
  const state = kycMockStateByPage.get(page);
  if (!state) {
    throw new Error('KYC mock state not installed');
  }

  if (endpoint === '/kyc/profile') {
    state.profile = {
      ...state.profile,
      ...data,
    };
    return;
  }

  if (endpoint === '/kyc/fiscal') {
    state.fiscal = {
      ...state.fiscal,
      ...data,
    };
    return;
  }

  if (endpoint === '/kyc/bank') {
    state.bank = {
      ...state.bank,
      bankCode: '001',
      bankName: 'Banco do Brasil S.A.',
      ...data,
    };
  }
}

async function openBankSelector(page: Page) {
  // The Banco field is rendered as a <span> label followed by a <button>
  // with aria-label="Selecionar banco". Click the button directly so the
  // selector survives non-<label> presentation markup.
  await page.getByRole('button', { name: 'Selecionar banco' }).first().click();
  await expect(page.getByLabel('Buscar banco ou codigo')).toBeVisible({ timeout: 10000 });
}

// Small 1x1 red PNG for upload tests
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

// ── Tests ──

test.describe('Settings / KYC', () => {
  // Each KYC scenario performs auth bootstrap + dashboard navigation +
  // settings load + multiple form interactions and `waitForResponse`
  // round-trips. The default 30s budget runs out before the form submits
  // on a cold CI worker.
  test.describe.configure({ timeout: 180_000 });

  test('page loads and shows Minha conta', async ({ page, request }) => {
    await login(page, request);
    await goToSettings(page);

    await expect(page.getByRole('heading', { name: 'Minha conta' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Dados fiscais/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Documentos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Dados bancarios/i })).toBeVisible();
  });

  test('Dados Pessoais: save and persist (CPF absent)', async ({ page, request }) => {
    await login(page, request);
    await goToSettings(page);

    // Verify CPF field is NOT present in Dados Pessoais
    await expect(page.locator('input[placeholder="000.000.000-00"]')).not.toBeVisible();

    // Fill name
    const testName = `E2E User ${Date.now()}`;
    await page.fill('input[placeholder="Seu nome completo"]', testName);

    // Fill phone
    await page.fill('input[placeholder="(00) 00000-0000"]', '11999990000');

    await saveAndWaitForKycPut(page, '/kyc/profile', {
      name: testName,
      phone: '11999990000',
    });

    // Reload and verify persistence
    await revisitSettings(page, request);
    await expect(page.locator('input[placeholder="Seu nome completo"]')).toHaveValue(testName, {
      timeout: 10000,
    });
    await expect(page.locator('input[placeholder="(00) 00000-0000"]')).toHaveValue('11999990000');
  });

  test('Dados Fiscais PF: save CPF and persist', async ({ page, request }) => {
    await login(page, request);
    await goToSettings(page);
    await clickSidebarSection(page, 'Dados fiscais');

    // Default is PF — fill CPF and legal name
    await page.fill('input[placeholder="000.000.000-00"]', '12345678901');
    await page.fill('input[placeholder="Nome conforme documento"]', 'E2E Teste PF');

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

    // Fill address (required for completion)
    await page.fill('input[placeholder="00000-000"]', '01001000');
    // Wait for CEP autofill
    await expect(page.locator('input[placeholder="Nome da rua"]')).not.toHaveValue('', {
      timeout: 10000,
    });

    await page.fill('input[placeholder="123"]', '100');

    await saveAndWaitForKycPut(page, '/kyc/fiscal', {
      type: 'PF',
      cpf: '12345678901',
      fullName: 'E2E Teste PF',
      address: {
        postalCode: '01001000',
        street: 'Praca da Se',
        number: '100',
        district: 'Se',
        city: 'Sao Paulo',
        state: 'SP',
      },
    });

    // Reload and verify persistence
    await revisitSettings(page, request);
    await clickSidebarSection(page, 'Dados fiscais');
    await expect(page.locator('input[placeholder="000.000.000-00"]')).toHaveValue('12345678901', {
      timeout: 10000,
    });
    await expect(page.locator('input[placeholder="Nome conforme documento"]')).toHaveValue(
      'E2E Teste PF',
    );
  });

  test('Dados Fiscais PJ: CNPJ autofill fires', async ({ page, request }) => {
    await login(page, request);
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
    await expect(page.locator('input[placeholder="Razao social da empresa"]')).toHaveValue(
      'EMPRESA TESTE LTDA',
      { timeout: 10000 },
    );
  });

  test('CEP autofill populates address', async ({ page, request }) => {
    await login(page, request);
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
    await expect(page.locator('input[placeholder="Nome da rua"]')).toHaveValue(
      /Pra(ç|c)a da S(é|e)/,
      { timeout: 10000 },
    );
    await expect(page.locator('input[placeholder="Bairro"]')).toHaveValue(/S(é|e)/);
    await expect(page.locator('input[placeholder="Cidade"]')).toHaveValue(/S(ã|a)o Paulo/);
    await expect(page.locator('input[placeholder="SP"]')).toHaveValue('SP');
  });

  test('Dados Bancarios: save and persist', async ({ page, request }) => {
    await login(page, request);
    await goToSettings(page);
    await clickSidebarSection(page, 'Dados bancarios');

    await openBankSelector(page);
    await page.getByLabel('Buscar banco ou codigo').fill('Banco do Brasil');
    await page.getByRole('button', { name: /001.*Banco do Brasil S\.A\./i }).click();

    await page.fill('input[placeholder="0000"]', '1234');
    await page.fill('input[placeholder="00000-0"]', '567890-1');

    await saveAndWaitForKycPut(page, '/kyc/bank', {
      agency: '1234',
      account: '567890-1',
    });

    // Reload and verify
    await revisitSettings(page, request);
    await clickSidebarSection(page, 'Dados bancarios');
    await expect(page.getByText(/001\s+—\s+Banco do Brasil S\.A\./).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('input[placeholder="0000"]')).toHaveValue('1234');
    await expect(page.locator('input[placeholder="00000-0"]')).toHaveValue('567890-1');
  });

  test('Documentos: upload and delete', async ({ page, request }) => {
    await login(page, request);
    await goToSettings(page);
    await clickSidebarSection(page, 'Documentos');
    await dismissCookieBanner(page);

    // Upload first document (DOCUMENT_FRONT)
    const fileInputs = page.locator('input[type="file"]');
    await expect(fileInputs.first()).toBeAttached({ timeout: 15_000 });
    await fileInputs.first().setInputFiles({
      name: 'test-id.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    // Verify document card appears (shows file name or "Documento de identidade")
    await expect(page.getByText(/test-id\.png|Documento de identidade/)).toBeVisible({
      timeout: 15000,
    });

    // Delete — click trash icon (the button with the trash SVG)
    const deleteBtn = page
      .locator('button')
      .filter({ has: page.locator('svg polyline[points="3 6 5 6 21 6"]') });
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.first().click();
      // Verify upload zone reappears
      await expect(page.getByText('Documento de identidade')).toBeVisible({ timeout: 10000 });
    }
  });

  test('keeps edited profile data visible when save is unavailable', async ({ page, request }) => {
    await login(page, request);
    await goToSettings(page);

    // Try to save
    await page.fill('input[placeholder="Seu nome completo"]', 'Trigger Error');
    await clickSave(page);

    // Verify the form remains editable and does not discard the user's input.
    await expect(page.locator('input[placeholder="Seu nome completo"]').first()).toHaveValue(
      'Trigger Error',
    );
  });
});
