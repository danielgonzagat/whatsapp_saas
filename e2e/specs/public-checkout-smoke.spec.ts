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

/**
 * Seed a public-checkout fixture (product + plan) on the running backend so
 * the commercial shell can render. The CheckoutProductPlan model exposes a
 * `referenceCode` (cuid) that the frontend resolves via `/checkout/public/r/:code`.
 * If E2E_CHECKOUT_CODE / MP_TEST_CHECKOUT_CODE is provided, we use that and
 * skip the seed. Otherwise we create one and use the real referenceCode.
 */
async function ensurePublicCheckoutCode(
  request: import('@playwright/test').APIRequestContext,
): Promise<string> {
  const explicit = process.env.E2E_CHECKOUT_CODE || process.env.MP_TEST_CHECKOUT_CODE;
  if (explicit) {
    return explicit;
  }

  const auth = await ensureE2EAdmin(request);
  const { apiUrl } = getE2EBaseUrls();
  const headers = {
    authorization: `Bearer ${auth.token}`,
    'x-workspace-id': auth.workspaceId,
  } as const;

  // 1) Create a product (idempotent enough for our purposes — name is unique
  //    via timestamp and the seed runs once per test session).
  const productRes = await request.post(`${apiUrl}/products`, {
    headers,
    data: {
      name: `E2E Public Checkout Product ${Date.now()}`,
      description: 'Auto-seeded fixture for public-checkout-smoke spec.',
      price: 99,
      type: 'DIGITAL',
      status: 'APPROVED',
    },
  });
  if (!productRes.ok()) {
    throw new Error(
      `public-checkout-smoke: failed to seed product (${productRes.status()}): ${await productRes.text()}`,
    );
  }
  // POST /products may respond with either `{ id, ... }` (legacy) or
  // `{ product: { id, ... } }` (current admin shape). Accept both.
  const productBody = (await productRes.json()) as {
    id?: string;
    product?: { id?: string };
  };
  const productId = productBody.product?.id || productBody.id;
  if (!productId) {
    throw new Error(
      `public-checkout-smoke: seeded product response missing id (got: ${JSON.stringify(productBody)}).`,
    );
  }
  const product = { id: productId };

  // 2) Create a CheckoutProductPlan attached to the product. The response
  //    contains the referenceCode that resolves the public commercial shell.
  const planRes = await request.post(`${apiUrl}/checkout/products/${product.id}/plans`, {
    headers,
    data: {
      name: `E2E Public Plan ${Date.now()}`,
      priceInCents: 9900,
    },
  });
  if (!planRes.ok()) {
    throw new Error(
      `public-checkout-smoke: failed to seed plan (${planRes.status()}): ${await planRes.text()}`,
    );
  }
  const plan = (await planRes.json()) as { referenceCode?: string; id: string };
  if (!plan.referenceCode) {
    throw new Error(
      'public-checkout-smoke: seeded plan response missing referenceCode; cannot resolve public route.',
    );
  }
  return plan.referenceCode;
}

test('public checkout by short code renders the commercial shell', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { frontendUrl } = getE2EBaseUrls();
  const payUrl = toSubdomain(frontendUrl, 'pay');
  const checkoutCode = await ensurePublicCheckoutCode(request);
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
