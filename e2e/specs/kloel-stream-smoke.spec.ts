import { expect, test } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls, seedE2EAuthSession } from './e2e-helpers';

function toSubdomain(origin: string, subdomain: 'app' | 'pay') {
  const url = new URL(origin);
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.endsWith('.localhost')
  ) {
    if (!url.hostname.startsWith(`${subdomain}.`)) {
      url.hostname = `${subdomain}.${url.hostname.replace(/^(app|pay)\./, '')}`;
    }
  }

  return url.toString().replace(/\/$/, '');
}

test('Kloel dashboard shows thinking and streamed content for the stable SSE contract', async ({
  page,
  request,
}) => {
  // Cold-start auth + chat composer load + SSE round-trip exceed 30s on CI.
  test.setTimeout(90_000);

  const auth = await ensureE2EAdmin(request);
  const { frontendUrl } = getE2EBaseUrls();
  const appUrl = toSubdomain(frontendUrl, 'app');

  await page.route('**/kloel/think', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"type":"status","phase":"thinking","message":"Kloel está pensando"}\n\n',
        'data: {"type":"status","phase":"tool_calling"}\n\n',
        'data: {"type":"tool_call","callId":"call-1","tool":"search_web","args":{"query":"coreamy"}}\n\n',
        'data: {"type":"tool_result","callId":"call-1-result","tool":"search_web","success":true,"result":{"answer":"ok"}}\n\n',
        'data: {"type":"status","phase":"streaming_token","message":"Kloel está respondendo"}\n\n',
        'data: {"type":"content","content":"Resposta em streaming validada."}\n\n',
        'data: {"type":"done","done":true}\n\n',
      ].join(''),
    });
  });

  await page.route('**/kloel/threads/thread-smoke/messages', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'message-user-1',
            role: 'user',
            content: 'Oi',
            metadata: null,
          },
          {
            id: 'message-assistant-1',
            role: 'assistant',
            content: 'Resposta em streaming validada.',
            metadata: null,
          },
        ],
      }),
    });
  });

  await seedE2EAuthSession(page, auth);
  await page.goto(`${appUrl}/chat`, { waitUntil: 'domcontentloaded' });

  const acceptCookiesButton = page.getByRole('button', { name: 'Aceitar tudo' });
  if (await acceptCookiesButton.isVisible().catch(() => false)) {
    await acceptCookiesButton.click();
  }

  const input = page.getByPlaceholder('Como posso ajudar você hoje?');
  await expect(page.getByRole('button', { name: 'Criar Anúncio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escrever Copy' })).toBeVisible();
  // The disclaimer is rendered conditionally once the conversation has
  // messages — see KloelDashboard's `hasMessages ? <ChatDisclaimer /> : null`.
  // We assert it AFTER sending the first message (below) instead of on the
  // empty state, since the empty state intentionally omits the disclaimer.

  await input.click();
  await input.fill('Oi');
  await expect(input).toHaveValue('Oi');
  await expect(page.getByLabel('Enviar mensagem')).toBeEnabled();
  await page.getByLabel('Enviar mensagem').click();

  await expect(page.getByText('Kloel está pensando')).toBeVisible();
  await expect(page.getByText('Resposta em streaming validada.')).toBeVisible();
  await expect(page.getByText('Kloel é uma IA e pode errar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar Anúncio' })).toHaveCount(0);
});
