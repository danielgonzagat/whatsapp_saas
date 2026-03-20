import { expect, test, type Page } from '@playwright/test';
import { getE2EBaseUrls } from './e2e-helpers';

const { frontendUrl: FRONTEND_URL, apiUrl: API_URL } = getE2EBaseUrls();

const ACCESS_TOKEN_KEY = 'kloel_access_token';
const WORKSPACE_KEY = 'kloel_workspace_id';
const TEST_TOKEN = 'e2e-access-token';
const TEST_WORKSPACE_ID = 'e2e-workspace-id';
const QR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zx2QAAAAASUVORK5CYII=';

async function seedAuthStorage(page: Page) {
  await page.addInitScript(
    ({ token, workspaceId }) => {
      window.localStorage.setItem('kloel_access_token', token);
      window.localStorage.setItem('kloel_workspace_id', workspaceId);
    },
    { token: TEST_TOKEN, workspaceId: TEST_WORKSPACE_ID },
  );
}

async function installQrMocks(page: Page) {
  let sessionState: 'disconnected' | 'qr_pending' = 'disconnected';
  const workspacePayload = {
    user: {
      id: 'user-e2e',
      workspaceId: TEST_WORKSPACE_ID,
      email: 'e2e@example.com',
    },
    workspaces: [{ id: TEST_WORKSPACE_ID, name: 'E2E Workspace' }],
  };

  await page.route('**/api/workspace/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(workspacePayload),
    });
  });

  await page.route(`${API_URL}/**`, async (route) => {
    const url = route.request().url();

    if (url.endsWith('/workspace/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workspacePayload),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });

  await page.route('**/api/whatsapp-api/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({
        type: 'status',
        workspaceId: TEST_WORKSPACE_ID,
        phase: 'live_stream_ready',
        message: 'ok',
        ts: new Date().toISOString(),
      })}\n\n`,
    });
  });

  await page.route('**/api/whatsapp-api/session/status', async (route) => {
    const body =
      sessionState === 'disconnected'
        ? {
            connected: false,
            status: 'DISCONNECTED',
            message: 'WhatsApp desconectado.',
          }
        : {
            connected: false,
            status: 'SCAN_QR_CODE',
            qrCode: QR_DATA_URL,
            message: 'Escaneie o QR Code para conectar.',
          };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.route('**/api/whatsapp-api/session/start', async (route) => {
    sessionState = 'qr_pending';
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
        available: true,
        qr: QR_DATA_URL,
        message: 'Escaneie o QR Code para conectar.',
      }),
    });
  });
}

test.describe('WhatsApp QR flow', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthStorage(page);
    await installQrMocks(page);
  });

  test('renders the QR code on the dedicated session harness', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/e2e/whatsapp-session`);

    await page.getByRole('button', { name: 'Conectar WhatsApp', exact: true }).click();

    await expect(page.getByText(/Aguardando leitura|Escaneie o QR Code/i)).toBeVisible();
    const qrImage = page.getByAltText('QR Code E2E WhatsApp');
    await expect(qrImage).toBeVisible({ timeout: 10000 });
    await expect(qrImage).toHaveAttribute('src', /data:image\/png;base64,/);
  });

  test('renders the QR code in the real WhatsApp drawer harness', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/e2e/whatsapp-console`);

    await page.locator('button').filter({ hasText: 'QR Code' }).first().click();
    await expect(page.getByText('Escaneie seu QR Code')).toBeVisible();

    await page.getByRole('button', { name: 'Conectar WhatsApp', exact: true }).click();

    const qrImage = page.getByAltText('QR Code do WhatsApp');
    await expect(qrImage).toBeVisible({ timeout: 10000 });
    await expect(qrImage).toHaveAttribute('src', /data:image\/png;base64,/);
  });
});
