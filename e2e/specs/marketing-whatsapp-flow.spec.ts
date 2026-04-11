import { expect, test, type Page } from '@playwright/test';
import { getE2EBaseUrls, seedE2EAuthSession } from './e2e-helpers';

const { frontendUrl: FRONTEND_URL } = getE2EBaseUrls();

const TEST_WORKSPACE_ID = 'e2e-workspace-id';
const QR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zx2QAAAAASUVORK5CYII=';

function createTestJwt(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encoded}.signature`;
}

const TEST_TOKEN = createTestJwt({
  sub: 'user-e2e',
  email: 'e2e@example.com',
  workspaceId: TEST_WORKSPACE_ID,
  name: 'E2E User',
});

async function installMarketingWhatsAppFlowMocks(page: Page) {
  let sessionState: 'disconnected' | 'qr_pending' | 'connected' = 'disconnected';
  let settingsState: Record<string, any> = {
    providerSettings: {
      whatsappProvider: 'whatsapp-api',
      whatsappApiSession: {
        provider: 'whatsapp-api',
        status: 'DISCONNECTED',
      },
    },
  };
  let summaryState: Record<string, any> = {
    configured: false,
    sessionName: TEST_WORKSPACE_ID,
    configuredAt: null,
    activatedAt: null,
    arsenalCount: 0,
    tone: null,
    maxDiscount: 10,
    followUpEnabled: true,
    selectedProducts: [],
  };

  const authPayload = {
    user: {
      id: 'user-e2e',
      workspaceId: TEST_WORKSPACE_ID,
      email: 'e2e@example.com',
      name: 'E2E User',
    },
    workspaces: [{ id: TEST_WORKSPACE_ID, name: 'E2E Workspace' }],
  };

  const productsPayload = {
    products: [
      {
        id: 'prod-1',
        name: 'Produto Teste',
        price: 97,
        status: 'APPROVED',
        active: true,
        imageUrl: null,
      },
    ],
    count: 1,
  };

  const syncSessionSnapshot = () => {
    settingsState = {
      ...settingsState,
      providerSettings: {
        ...settingsState.providerSettings,
        whatsappApiSession: {
          ...(settingsState.providerSettings?.whatsappApiSession || {}),
          provider: 'whatsapp-api',
          status:
            sessionState === 'connected'
              ? 'CONNECTED'
              : sessionState === 'qr_pending'
                ? 'SCAN_QR_CODE'
                : 'DISCONNECTED',
          phoneNumber: sessionState === 'connected' ? '+55 11 99999-9999' : null,
          pushName: sessionState === 'connected' ? 'Loja E2E' : null,
        },
      },
    };
  };

  await page.route('**/api/workspace/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authPayload),
    });
  });

  await page.route('**/api/v1/cookie-consent', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        consent: {
          necessary: true,
          analytics: false,
          marketing: false,
        },
      }),
    });
  });

  await page.route('**/marketing/connect/status', async (route) => {
    syncSessionSnapshot();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: {
          whatsapp: {
            provider: 'whatsapp-api',
            connected: sessionState === 'connected',
            status: sessionState === 'connected' ? 'connected' : 'disconnected',
          },
        },
      }),
    });
  });

  await page.route('**/meta/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: false }),
    });
  });

  await page.route('**/marketing/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalMessages: 0,
        totalLeads: 0,
        totalSales: 0,
        totalRevenue: 0,
      }),
    });
  });

  await page.route('**/marketing/channels', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/marketing/live-feed', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: [] }),
    });
  });

  await page.route('**/marketing/ai-brain', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        productsLoaded: 1,
        activeConversations: 0,
        objectionsMapped: 0,
        avgResponseTime: '0s',
        status: 'ready',
      }),
    });
  });

  await page.route('**/marketing/whatsapp/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(summaryState),
    });
  });

  await page.route('**/products*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(productsPayload),
    });
  });

  await page.route(`**/affiliate/my-products/${TEST_WORKSPACE_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route(`**/workspace/${TEST_WORKSPACE_ID}/settings`, async (route) => {
    syncSessionSnapshot();

    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, any>;
      settingsState = {
        ...settingsState,
        providerSettings: {
          ...(settingsState.providerSettings || {}),
          ...body,
        },
      };

      const setup = body.whatsappSetup;
      if (setup && body.autopilot?.enabled) {
        const activatedAt = new Date().toISOString();
        summaryState = {
          configured: true,
          sessionName: TEST_WORKSPACE_ID,
          configuredAt: setup.configuredAt || activatedAt,
          activatedAt,
          arsenalCount: Array.isArray(setup.arsenal) ? setup.arsenal.length : 0,
          tone: setup.config?.tone || null,
          maxDiscount: Number(setup.config?.maxDiscount || 0),
          followUpEnabled: Boolean(setup.config?.followUp),
          selectedProducts: Array.isArray(setup.selectedProducts)
            ? setup.selectedProducts.map((product: Record<string, any>) => ({
                ...product,
                salesCount: 0,
                revenue: 0,
              }))
            : [],
        };
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(settingsState),
    });
  });

  await page.route('**/api/whatsapp-api/session/start', async (route) => {
    sessionState = 'qr_pending';
    syncSessionSnapshot();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'session_started',
      }),
    });
  });

  await page.route('**/api/whatsapp-api/session/qr', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: sessionState !== 'disconnected',
        qr: sessionState === 'disconnected' ? null : QR_DATA_URL,
        message:
          sessionState === 'disconnected'
            ? 'QR Code não disponível.'
            : 'Escaneie o QR Code para conectar.',
      }),
    });
  });

  await page.route('**/api/whatsapp-api/session/status', async (route) => {
    if (sessionState === 'qr_pending') {
      setTimeout(() => {
        sessionState = 'connected';
        syncSessionSnapshot();
      }, 50);
    }

    syncSessionSnapshot();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connected: sessionState === 'connected',
        status:
          sessionState === 'connected'
            ? 'CONNECTED'
            : sessionState === 'qr_pending'
              ? 'SCAN_QR_CODE'
              : 'DISCONNECTED',
        provider: 'whatsapp-api',
        phone: sessionState === 'connected' ? '+55 11 99999-9999' : undefined,
        pushName: sessionState === 'connected' ? 'Loja E2E' : undefined,
      }),
    });
  });
}

test.describe('Marketing WhatsApp flow', () => {
  test.beforeEach(async ({ page }) => {
    await seedE2EAuthSession(page, {
      token: TEST_TOKEN,
      workspaceId: TEST_WORKSPACE_ID,
    });
    await installMarketingWhatsAppFlowMocks(page);
  });

  test('shows the qr visibly and completes the setup wizard after connection', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/marketing/whatsapp`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByText('Conectar WhatsApp')).toBeVisible();
    await expect(page.getByAltText('QR Code do WhatsApp')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('QR Code pronto para leitura.')).toBeVisible();

    await expect(page.getByText('Selecione os produtos')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Selecionar todos' }).click();
    await page.getByRole('button', { name: 'Próximo →' }).click();

    await expect(page.getByText('Arsenal de vendas')).toBeVisible();
    await page.getByRole('button', { name: 'Pular por agora →' }).click();

    await expect(page.getByText('Configurar a IA')).toBeVisible();
    const acceptCookiesButton = page.getByRole('button', { name: 'Aceitar tudo' });
    if (await acceptCookiesButton.isVisible().catch(() => false)) {
      await acceptCookiesButton.click();
    }
    await page.getByRole('button', { name: 'Salvar e ativar IA' }).click();

    await expect(page.getByText('IA Ativada!')).toBeVisible();
  });
});
