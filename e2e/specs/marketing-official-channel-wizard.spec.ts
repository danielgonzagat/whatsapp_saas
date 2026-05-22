import { expect, test, type Page } from '@playwright/test';
import { getE2EBaseUrls, seedE2EAuthSession } from './e2e-helpers';

const { appUrl: APP_URL } = getE2EBaseUrls();
const WORKSPACE_ID = 'wizard-workspace-id';
const CHANNELS = ['whatsapp', 'instagram', 'facebook', 'tiktok', 'email'] as const;

function createTestJwt(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encoded}.signature`;
}

async function installOfficialChannelWizardMocks(page: Page) {
  const savedSetups = new Map<string, Record<string, unknown>>();
  const authPayload = {
    user: {
      id: 'wizard-user-id',
      workspaceId: WORKSPACE_ID,
      email: 'wizard@example.com',
      name: 'Wizard User',
    },
    workspaces: [{ id: WORKSPACE_ID, name: 'Wizard Workspace' }],
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
  await page.route(`**/onboarding/${WORKSPACE_ID}/status`, async (route) => {
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
      body: JSON.stringify({ status: 'active' }),
    });
  });
  await page.route('**/api/v1/cookie-consent', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ consent: { necessary: true, analytics: false, marketing: false } }),
    });
  });
  await page.route('**/products*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        products: [{ id: 'prod-1', name: 'Produto Wizard', price: 97 }],
        count: 1,
      }),
    });
  });
  await page.route('**/marketing/connect/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: {
          whatsapp: { connected: false, status: 'disconnected' },
          instagram: { connected: false, status: 'disconnected' },
          facebook: { connected: false, status: 'disconnected' },
          email: {
            connected: false,
            status: 'disconnected',
            providerAvailable: true,
            provider: 'log',
          },
        },
      }),
    });
  });
  await page.route('**/marketing/connect/tiktok/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: false, status: 'disconnected' }),
    });
  });
  await page.route('**/marketing/connect/channel-setup**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const channel = String(body.channel || '');
      const setup = {
        currentStep: Number(body.currentStep || 0),
        selectedProductIds: Array.isArray(body.selectedProductIds) ? body.selectedProductIds : [],
        arsenal: Array.isArray(body.arsenal) ? body.arsenal : [],
        config: typeof body.config === 'object' && body.config ? body.config : {},
      };
      savedSetups.set(channel, setup);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ channel, setup }),
      });
      return;
    }
    const channel = url.searchParams.get('channel') || 'whatsapp';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channel,
        setup: savedSetups.get(channel) || {
          currentStep: 0,
          selectedProductIds: [],
          arsenal: [],
          config: {},
        },
      }),
    });
  });
}

test.describe('Official Marketing channel wizard', () => {
  test.beforeEach(async ({ page }) => {
    await seedE2EAuthSession(page, {
      token: createTestJwt({
        sub: 'wizard-user-id',
        email: 'wizard@example.com',
        workspaceId: WORKSPACE_ID,
      }),
      workspaceId: WORKSPACE_ID,
    });
    await installOfficialChannelWizardMocks(page);
  });

  for (const width of [1024, 380]) {
    test(`shows all four setup steps on every channel at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      for (const channel of CHANNELS) {
        await page.goto(`${APP_URL}/marketing/${channel}`, { waitUntil: 'domcontentloaded' });

        await expect(page.getByLabel('Passo 1')).toBeVisible();
        await expect(page.getByLabel('Passo 2')).toBeVisible();
        await expect(page.getByLabel('Passo 3')).toBeVisible();
        await expect(page.getByLabel('Passo 4')).toBeVisible();
        await expect(page.getByText('Passo 1 de 4')).toBeVisible();
      }
    });
  }

  test('persists product setup progress through the channel setup endpoint', async ({ page }) => {
    await page.goto(`${APP_URL}/marketing/email`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Passo 1 de 4')).toBeVisible();
    await page.getByRole('button', { name: 'Passo 2' }).click();
    await expect(page.getByText('Passo 2 de 4')).toBeVisible();
    await page.getByText('Produto Wizard').click();
    await page.getByRole('button', { name: 'Salvar produtos' }).click();
    await expect(page.getByText('Produtos do canal salvos.')).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Passo 2' }).click();
    await expect(page.getByRole('checkbox')).toBeChecked();
  });

  test('requires double confirmation before disconnecting Meta', async ({ page }) => {
    await page.unroute('**/marketing/connect/status');
    await page.route('**/marketing/connect/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          channels: {
            whatsapp: { connected: true, status: 'connected', phoneNumberId: 'phone-1' },
            instagram: { connected: false, status: 'disconnected' },
            facebook: { connected: true, status: 'connected', pageId: 'page-1' },
            email: { connected: false, status: 'disconnected', providerAvailable: true },
          },
        }),
      });
    });

    let disconnectCalled = false;
    await page.route('**/meta/auth/disconnect', async (route) => {
      disconnectCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'disconnected' }),
      });
    });

    await page.goto(`${APP_URL}/marketing/facebook`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Desconectar Meta' })).toBeVisible();

    await page.getByRole('button', { name: 'Desconectar Meta' }).click();
    await expect(page.getByText('Clique novamente em Confirmar desconexão')).toBeVisible();
    expect(disconnectCalled).toBe(false);

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Confirmar desconexão' }).click();
    await expect.poll(() => disconnectCalled).toBe(true);
  });
});
