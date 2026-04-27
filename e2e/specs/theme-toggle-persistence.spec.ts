import { expect, test } from '@playwright/test';
import { bootstrapAuthenticatedPage, ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const THEME_STORAGE_SLOT = 'kloel-app-theme';

test.describe('theme toggle persistence', () => {
  test('defaults to light and persists dark mode after toggle', async ({ page, request }) => {
    const auth = await ensureE2EAdmin(request);
    const { appUrl } = getE2EBaseUrls();

    await page.setViewportSize({ width: 1440, height: 1100 });

    await bootstrapAuthenticatedPage(page, auth, { landingPath: '/products' });
    await page.goto(`${appUrl}/products`, { waitUntil: 'networkidle' });

    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.getAttribute('data-kloel-app-theme')),
      )
      .toBe('light');
    await expect
      .poll(async () =>
        page.evaluate((themeKey) => window.localStorage.getItem(themeKey), THEME_STORAGE_SLOT),
      )
      .toBe('light');

    // The trigger renders the authenticated user's initials. In CI this is
    // the seeded E2E admin ("EA"); locally it is the developer's account
    // (e.g. "DG", "Daniel Gonzaga"). Match either initials or any
    // capitalised account label so the test stays portable.
    const userMenuTrigger = page
      .getByRole('button', { name: /^(ea|dg|daniel gonzaga|e2e admin)$/i })
      .first();
    await expect(userMenuTrigger).toBeVisible({ timeout: 15000 });
    await userMenuTrigger.click();

    const themeToggle = page.getByRole('switch', { name: /alternar tema/i });
    await expect(themeToggle).toBeVisible();
    await expect(themeToggle).toHaveAttribute('aria-checked', 'false');
    await themeToggle.click();

    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.getAttribute('data-kloel-app-theme')),
      )
      .toBe('dark');
    await expect
      .poll(async () =>
        page.evaluate((themeKey) => window.localStorage.getItem(themeKey), THEME_STORAGE_SLOT),
      )
      .toBe('dark');

    await page.reload({ waitUntil: 'networkidle' });

    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.getAttribute('data-kloel-app-theme')),
      )
      .toBe('dark');
    await expect
      .poll(async () =>
        page.evaluate((themeKey) => window.localStorage.getItem(themeKey), THEME_STORAGE_SLOT),
      )
      .toBe('dark');
  });
});
