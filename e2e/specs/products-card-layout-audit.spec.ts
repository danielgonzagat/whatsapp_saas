import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { bootstrapAuthenticatedPage, ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const ARTIFACT_DIR = path.join(process.cwd(), 'test-results', 'products-card-layout-audit');

async function captureProductsCard(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  viewport: { width: number; height: number },
  slug: string,
) {
  const auth = await ensureE2EAdmin(request);
  const { appUrl } = getE2EBaseUrls();

  await page.setViewportSize(viewport);
  await bootstrapAuthenticatedPage(page, auth, { landingPath: '/products' });
  await page.goto(`${appUrl}/products`, { waitUntil: 'networkidle' });

  const editButton = page.getByRole('button', { name: /editar/i }).first();
  await expect(editButton).toBeVisible({ timeout: 15000 });
  await editButton.scrollIntoViewIfNeeded();

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${slug}.png`),
    fullPage: false,
  });

  return page.evaluate(() => {
    const edit = document.querySelector('button[aria-label="Editar"]') as HTMLElement | null;
    const cards = Array.from(document.querySelectorAll('div')).filter((node) => {
      const text = (node.textContent || '').trim();
      return text.includes('Preço') && (text.includes('Rascunho') || text.includes('Ativo'));
    });
    const firstCard = cards[0] as HTMLElement | undefined;
    const image = firstCard?.querySelector('img') as HTMLElement | null;
    const price = firstCard
      ? Array.from(firstCard.querySelectorAll('span')).find((node) =>
          (node.textContent || '').trim().startsWith('R$'),
        )
      : null;
    const title = firstCard
      ? Array.from(firstCard.querySelectorAll('div')).find((node) => {
          const style = window.getComputedStyle(node);
          return style.fontWeight === '600' || style.fontWeight === '700';
        })
      : null;

    const rect = (node: Element | null | undefined) =>
      node ? (node as HTMLElement).getBoundingClientRect().toJSON() : null;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      editRect: rect(edit),
      cardRect: rect(firstCard),
      imageRect: rect(image),
      priceRect: rect(price || null),
      titleRect: rect(title || null),
      snippet: firstCard?.textContent?.slice(0, 500) || null,
    };
  });
}

test.describe('products card layout audit', () => {
  test('desktop snapshot and geometry', async ({ page, request }) => {
    const data = await captureProductsCard(page, request, { width: 1440, height: 1100 }, 'desktop');
    expect(data.cardRect).toBeTruthy();
    expect(data.editRect).toBeTruthy();
    expect(data.imageRect).toBeTruthy();
    console.log(JSON.stringify({ desktop: data }, null, 2));
  });

  test('mobile snapshot and geometry', async ({ page, request }) => {
    const data = await captureProductsCard(page, request, { width: 390, height: 844 }, 'mobile');
    expect(data.cardRect).toBeTruthy();
    expect(data.editRect).toBeTruthy();
    expect(data.imageRect).toBeTruthy();
    console.log(JSON.stringify({ mobile: data }, null, 2));
  });
});
