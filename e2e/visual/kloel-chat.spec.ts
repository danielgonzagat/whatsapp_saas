import { expect, test, type Page } from '@playwright/test';
import { mockVisualAuthApis } from './critical-flows.auth-mocks';
import { ensureE2EAdmin, getE2EBaseUrls, seedE2EAuthSession } from '../specs/e2e-helpers';

const OWNED_PRODUCT = {
  id: 'product-owned-visual',
  name: 'Oferta Kloel Visual',
  price: 197,
  active: true,
  status: 'PUBLISHED',
  category: 'Marketing',
  imageUrl:
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=240&q=80',
};

const AFFILIATE_PRODUCTS = {
  items: [
    {
      id: 'affiliate-request-visual',
      status: 'APPROVED',
      affiliateProductId: 'affiliate-product-visual',
      affiliateProduct: {
        id: 'affiliate-product-visual',
        productId: 'catalog-product-visual',
        name: 'Oferta parceira',
        category: 'Marketplace',
        imageUrl:
          'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=240&q=80',
      },
    },
  ],
};

const THINK_STREAM_BODY = [
  'data: {"type":"status","phase":"thinking","message":"Kloel está pensando"}\n\n',
  'data: {"type":"status","phase":"tool_calling"}\n\n',
  'data: {"type":"content","content":"Estruture uma landing com headline forte, prova social e CTA único."}\n\n',
  'data: {"type":"done","done":true}\n\n',
].join('');

async function acceptCookiesIfVisible(page: Page) {
  const acceptCookiesButton = page.getByRole('button', { name: 'Aceitar tudo' });
  if (await acceptCookiesButton.isVisible().catch(() => false)) {
    await acceptCookiesButton.click();
  }
}

async function freezeChatUi(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }

      html, body {
        scrollbar-gutter: stable !important;
      }

      *:focus,
      *:focus-visible {
        outline: none !important;
      }
    `,
  });
}

test('Kloel chat preserves the new empty and active visual contract', async ({ page, request }) => {
  const auth = await ensureE2EAdmin(request);
  const { appUrl } = getE2EBaseUrls();

  await mockVisualAuthApis(page, auth);

  await page.addInitScript(() => {
    window.localStorage.removeItem('kloel:conversations');
    window.localStorage.removeItem('kloel:activeConv');
  });

  await page.route('**/kloel/threads', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fallback();
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/products**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() !== 'GET' || !requestUrl.pathname.endsWith('/products')) {
      return route.fallback();
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ products: [OWNED_PRODUCT], count: 1 }),
    });
  });

  await page.route('**/affiliate/my-products**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AFFILIATE_PRODUCTS),
    });
  });

  await page.route('**/kloel/think', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: THINK_STREAM_BODY,
    });
  });

  await seedE2EAuthSession(page, auth);
  await page.goto(`${appUrl}/chat`, { waitUntil: 'networkidle' });
  await acceptCookiesIfVisible(page);
  await freezeChatUi(page);

  await expect(page.getByPlaceholder('Como posso ajudar você hoje?')).toBeVisible();
  await expect(
    page.getByText('Kloel é uma IA e pode errar. Confira informações importantes.'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar Anúncio' })).toBeVisible();

  await expect(page).toHaveScreenshot('kloel-chat-empty.png', {
    fullPage: true,
    maxDiffPixels: 10000,
  });

  await page.getByLabel('Abrir capacidades do prompt').click();
  await expect(page.getByText('Adicionar fotos e arquivos')).toBeVisible();

  await expect(page).toHaveScreenshot('kloel-chat-popover.png', {
    fullPage: true,
    maxDiffPixels: 10000,
  });

  await page.getByRole('button', { name: 'Criar site' }).click();
  await page.getByLabel('Abrir capacidades do prompt').click();
  await page.getByRole('button', { name: 'Vincular Produto' }).hover();
  await page.getByRole('button', { name: /Oferta Kloel Visual/i }).click();

  await expect(page.getByText('Criar site')).toBeVisible();
  await expect(page.locator('span[title="Oferta Kloel Visual"]')).toBeVisible();

  await expect(page).toHaveScreenshot('kloel-chat-configured.png', {
    fullPage: true,
    maxDiffPixels: 10000,
  });

  const input = page.getByPlaceholder('Descreva o site que deseja criar...');
  await input.fill('Monte uma landing page premium para vender meu produto principal.');
  await page.getByLabel('Enviar mensagem').click();

  await expect(
    page.getByText('Estruture uma landing com headline forte, prova social e CTA único.'),
  ).toBeVisible();
  await expect(
    page.getByText('Kloel é uma IA e pode errar. Confira informações importantes.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar Anúncio' })).toHaveCount(0);

  await expect(page).toHaveScreenshot('kloel-chat-active.png', {
    fullPage: true,
    maxDiffPixels: 10000,
  });
});
