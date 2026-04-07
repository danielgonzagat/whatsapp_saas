import { expect, test } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

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
  const auth = await ensureE2EAdmin(request);
  const { frontendUrl } = getE2EBaseUrls();
  const appUrl = toSubdomain(frontendUrl, 'app');

  await page.route('**/kloel/think', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'data: {"type":"thread","conversationId":"thread-smoke","title":"Nova conversa"}\n\n',
        'data: {"type":"status","phase":"thinking","message":"Kloel está pensando"}\n\n',
        'data: {"type":"status","phase":"tool_calling"}\n\n',
        'data: {"type":"tool_call","callId":"call-1","tool":"search_web","args":{"query":"coreamy"}}\n\n',
        'data: {"type":"tool_result","callId":"call-1","tool":"search_web","success":true,"result":{"answer":"ok"}}\n\n',
        'data: {"type":"status","phase":"streaming_token","message":"Kloel está respondendo"}\n\n',
        'data: {"type":"content","content":"Resposta em streaming validada."}\n\n',
        'data: {"type":"done","done":true}\n\n',
      ].join(''),
    });
  });

  await page.context().addCookies([
    {
      name: 'kloel_auth',
      value: '1',
      url: appUrl,
      sameSite: 'Lax',
    },
    {
      name: 'kloel_token',
      value: auth.token,
      url: appUrl,
      sameSite: 'Lax',
    },
  ]);
  await page.addInitScript(({ token, workspaceId }) => {
    window.localStorage.setItem('kloel_access_token', token);
    window.localStorage.setItem('kloel_workspace_id', workspaceId);
  }, auth);

  await page.goto(`${appUrl}/`, { waitUntil: 'domcontentloaded' });

  const acceptCookiesButton = page.getByRole('button', { name: 'Aceitar tudo' });
  if (await acceptCookiesButton.isVisible().catch(() => false)) {
    await acceptCookiesButton.click();
  }

  const input = page.getByPlaceholder('Como posso ajudar você hoje?');
  await input.click();
  await input.fill('Oi');
  await expect(input).toHaveValue('Oi');
  await page.getByLabel('Enviar mensagem').click();

  await expect(page.getByText('Kloel está pensando')).toBeVisible();
  await expect(page.getByText('Resposta em streaming validada.')).toBeVisible();
});
