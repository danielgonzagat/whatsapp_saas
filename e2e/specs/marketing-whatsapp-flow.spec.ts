import { expect, test, type Page } from '@playwright/test';
import { dismissCookieBanner, getE2EBaseUrls, seedE2EAuthSession } from './e2e-helpers';

const { appUrl: APP_URL } = getE2EBaseUrls();

const TEST_WORKSPACE_ID = 'e2e-workspace-id';
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

type JsonRecord = Record<string, unknown>;
type WhatsAppSetup = {
  configuredAt?: string;
  arsenal?: unknown[];
  config?: {
    tone?: string | null;
    maxDiscount?: number | string | null;
    followUp?: boolean | null;
  };
  selectedProducts?: JsonRecord[];
};

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

async function installMarketingWhatsAppFlowMocks(page: Page) {
  let sessionState: 'disconnected' | 'connected' = 'disconnected';
  let settingsState: JsonRecord = {
    providerSettings: {
      whatsappProvider: 'meta-cloud',
      whatsappApiSession: {
        provider: 'meta-cloud',
        status: 'DISCONNECTED',
      },
    },
  };
  let summaryState: JsonRecord = {
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
          provider: 'meta-cloud',
          status: sessionState === 'connected' ? 'CONNECTED' : 'DISCONNECTED',
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
  await page.route('**/workspace/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authPayload),
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
            provider: 'meta-cloud',
            connected: sessionState === 'connected',
            status: sessionState === 'connected' ? 'connected' : 'disconnected',
            authUrl: 'https://www.facebook.com/v21.0/dialog/oauth?client_id=e2e',
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

  await page.route('**/channel-setup/whatsapp', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        arsenal: [],
        channel: 'whatsapp',
        completed: false,
        config: null,
        products: productsPayload.products,
        selectedProductIds: [],
        setup: null,
      }),
    });
  });

  await page.route('**/channel-setup/whatsapp/products', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        arsenal: [],
        channel: 'whatsapp',
        completed: false,
        config: null,
        products: productsPayload.products,
        selectedProductIds: ['prod-1'],
        setup: { currentStep: 1 },
      }),
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
      const body = route.request().postDataJSON() as JsonRecord;
      settingsState = {
        ...settingsState,
        providerSettings: {
          ...asJsonRecord(settingsState.providerSettings),
          ...body,
        },
      };

      const setup = body.whatsappSetup as WhatsAppSetup | undefined;
      const autopilot = body.autopilot as { enabled?: boolean } | undefined;
      if (setup && autopilot?.enabled) {
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
            ? setup.selectedProducts.map((product) => ({
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

  await page.route('**/whatsapp-api/session/status', async (route) => {
    syncSessionSnapshot();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connected: sessionState === 'connected',
        status: sessionState === 'connected' ? 'CONNECTED' : 'DISCONNECTED',
        provider: 'meta-cloud',
        phone: sessionState === 'connected' ? '+55 11 99999-9999' : undefined,
        pushName: sessionState === 'connected' ? 'Loja E2E' : undefined,
      }),
    });
  });
}

test.describe('Marketing WhatsApp flow', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      console.error('[E2E][pageerror]', err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[E2E][console.error]', msg.text());
      }
    });
    await seedE2EAuthSession(page, {
      token: TEST_TOKEN,
      workspaceId: TEST_WORKSPACE_ID,
    });
    await installMarketingWhatsAppFlowMocks(page);
  });

  test('shows the Meta wizard steps without exposing the old QR path', async ({ page }) => {
    await page.goto(`${APP_URL}/marketing/whatsapp`, {
      waitUntil: 'domcontentloaded',
    });
    await dismissCookieBanner(page);

    await expect(page.getByText('Conectar WhatsApp')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/autorizacao oficial da Meta/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByAltText('QR Code do WhatsApp')).toHaveCount(0);

    await page.getByRole('button', { name: 'Proximo' }).click();
    await expect(page.getByText('Passo 2 de 4')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Conta necessaria')).toBeVisible();

    await page.getByLabel('Produto Teste').check();
    await page.getByRole('button', { name: 'Salvar e avancar' }).click();
    await expect(page.getByText('Passo 3 de 4')).toBeVisible();
    await expect(page.getByText('Arsenal do canal', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Proximo' }).click();
    await expect(page.getByText('Passo 4 de 4')).toBeVisible();
    await expect(page.getByText('Tom de voz')).toBeVisible();
  });
});
