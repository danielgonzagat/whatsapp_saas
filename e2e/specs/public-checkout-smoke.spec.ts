import { expect, test } from '@playwright/test';
import { getE2EBaseUrls } from './e2e-helpers';

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

test('public checkout by short code renders the commercial shell', async ({ page }) => {
  const { frontendUrl } = getE2EBaseUrls();
  const payUrl = toSubdomain(frontendUrl, 'pay');
  const checkoutCode =
    process.env.E2E_CHECKOUT_CODE || process.env.MP_TEST_CHECKOUT_CODE || 'MPX9Q2Z7';
  const consoleErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(`${payUrl}/${checkoutCode}`, {
    waitUntil: 'domcontentloaded',
  });

  const acceptCookiesButton = page.getByRole('button', { name: 'Aceitar tudo' });
  if (await acceptCookiesButton.isVisible().catch(() => false)) {
    await acceptCookiesButton.click();
  }

  await expect(page.locator('h3').filter({ hasText: 'RESUMO' })).toBeVisible();
  await expect(page.locator('h2').filter({ hasText: 'Identificação' })).toBeVisible();
  await expect(page.locator('h2').filter({ hasText: 'Pagamento' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
