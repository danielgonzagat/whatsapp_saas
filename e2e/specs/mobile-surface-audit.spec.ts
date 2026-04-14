import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  bootstrapAuthenticatedPage,
  ensureE2EAdmin,
  getE2EBaseUrls,
  type E2EAuthContext,
} from './e2e-helpers';

const { appUrl, apiUrl } = getE2EBaseUrls();
const ARTIFACT_DIR = path.join(process.cwd(), 'test-results', 'mobile-surface-audit');

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function dismissCookieBanner(page: import('@playwright/test').Page) {
  const acceptAllButton = page.getByRole('button', { name: /aceitar tudo/i });
  if (await acceptAllButton.isVisible().catch(() => false)) {
    await acceptAllButton.click();
    await page.waitForTimeout(250);
  }
}

test.describe('Mobile Surface Audit', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(180000);

  test('core app routes stay usable on mobile', async ({ page, request }) => {
    const auth: E2EAuthContext = await ensureE2EAdmin(request);
    const { token, workspaceId } = auth;

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

    const productRes = await request.get(`${apiUrl}/products`, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
      },
    });

    if (!productRes.ok()) {
      throw new Error(
        `Failed to load products for audit: ${productRes.status()} ${await productRes.text()}`,
      );
    }

    const productsPayload = await productRes.json();
    const products = Array.isArray(productsPayload?.products)
      ? productsPayload.products
      : Array.isArray(productsPayload)
        ? productsPayload
        : [];
    const firstProduct = products[0] ?? null;
    const firstProductId = firstProduct ? String(firstProduct.id) : null;

    await page.route(new RegExp(`^${escapeRegex(apiUrl)}/products(?:\\?.*)?$`), async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(productsPayload),
      });
    });

    if (firstProductId) {
      await page.route(
        new RegExp(`^${escapeRegex(apiUrl)}/products/${escapeRegex(firstProductId)}(?:\\?.*)?$`),
        async (route) => {
          if (route.request().method() !== 'GET') {
            await route.continue();
            return;
          }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ product: firstProduct }),
          });
        },
      );
    }

    await bootstrapAuthenticatedPage(page, auth, { landingPath: '/dashboard' });

    const routes: Array<{
      path: string;
      assert: () => Promise<void>;
      slug: string;
    }> = [
      {
        path: '/products',
        slug: 'products',
        assert: async () => {
          await expect(page.getByRole('button', { name: /novo produto/i })).toBeVisible();
          const editButton = page.getByRole('button', { name: /editar/i }).first();
          await editButton.scrollIntoViewIfNeeded().catch(() => undefined);
          await expect(editButton).toBeVisible({ timeout: 10000 });
        },
      },
      ...(firstProductId
        ? [
            {
              path: `/products/${firstProductId}`,
              slug: 'product-editor',
              assert: async () => {
                await expect(page.getByText(/dados gerais/i)).toBeVisible();
                await expect(page.getByRole('button', { name: /planos/i })).toBeVisible();
              },
            },
          ]
        : []),
      {
        path: '/marketing',
        slug: 'marketing',
        assert: async () => {
          await expect(page.getByRole('button', { name: /visao geral/i })).toBeVisible();
        },
      },
      {
        path: '/sites',
        slug: 'sites',
        assert: async () => {
          await expect(page.getByRole('button', { name: /visao geral/i })).toBeVisible();
        },
      },
      {
        path: '/anuncios',
        slug: 'anuncios',
        assert: async () => {
          await expect(page.getByRole('button', { name: /war room/i })).toBeVisible();
        },
      },
      {
        path: '/vendas',
        slug: 'vendas',
        assert: async () => {
          await expect(page.getByRole('button', { name: /gestao de vendas/i })).toBeVisible();
        },
      },
      {
        path: '/parcerias',
        slug: 'parcerias',
        assert: async () => {
          await expect(page.getByRole('heading', { name: /parcerias/i })).toBeVisible();
        },
      },
      {
        path: '/settings',
        slug: 'settings',
        assert: async () => {
          await expect(page.getByRole('heading', { name: /minha conta/i })).toBeVisible();
        },
      },
      {
        path: '/carteira',
        slug: 'carteira',
        assert: async () => {
          await expect(page.getByRole('button', { name: /saldo/i })).toBeVisible();
        },
      },
      {
        path: '/analytics',
        slug: 'analytics',
        assert: async () => {
          await expect(page.getByRole('button', { name: /operações|operacoes/i })).toBeVisible();
        },
      },
      {
        path: '/chat',
        slug: 'conversations',
        assert: async () => {
          await expect(page.getByRole('heading', { name: /conversas/i })).toBeVisible();
        },
      },
    ];

    for (const route of routes) {
      await page.goto(`${appUrl}${route.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await dismissCookieBanner(page);
      await route.assert();

      const overflow = await page.evaluate(() => {
        const body = document.body;
        const doc = document.documentElement;
        return {
          body: body ? body.scrollWidth - window.innerWidth : 0,
          doc: doc ? doc.scrollWidth - window.innerWidth : 0,
        };
      });

      expect(
        Math.max(overflow.body, overflow.doc),
        `${route.path} overflowed horizontally on mobile`,
      ).toBeLessThanOrEqual(1);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${route.slug}.png`),
        fullPage: true,
      });
    }
  });
});
