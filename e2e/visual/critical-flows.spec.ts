import { expect, test, type Page } from '@playwright/test';
import { bootstrapAuthenticatedPage, ensureE2EAdmin, getE2EBaseUrls } from '../specs/e2e-helpers';

/**
 * P6.5-1 / I20 — Visual Surface Frozen.
 *
 * This is the enforcement mechanism for the entire Wave 3 frontend
 * freeze. Every PR in Wave 3 (and beyond) must produce ZERO pixel
 * diff against the committed baselines for the 15 critical screens
 * across 3 viewports (mobile / tablet / desktop). A diff fails CI.
 *
 * ## How Playwright handles missing baselines
 *
 * On the first run for a given screen+viewport combination, the
 * baseline PNG does not exist on disk. Playwright's behavior:
 *   1. The test FAILS (loud signal that a new baseline is needed).
 *   2. The actual screenshot is written to the snapshot directory.
 *   3. The operator inspects the screenshot, decides if it is
 *      acceptable, then commits it as the baseline.
 *
 * Subsequent runs compare every screenshot against the committed
 * baseline byte-for-byte (with maxDiffPixelRatio: 0). Any diff fails.
 *
 * To intentionally update a baseline (e.g. an explicit visual change
 * that was approved out of band), run:
 *
 *   cd e2e && npx playwright test visual/critical-flows.spec.ts --update-snapshots
 *
 * The PR carrying the new baselines must be tagged with the
 * `VISUAL_CHANGE_APPROVED` label so reviewers acknowledge the
 * intentional change. See docs/visual-freeze.md.
 *
 * ## Authenticated routes
 *
 * Routes 4-15 require an authenticated session. We bootstrap one via
 * `ensureE2EAdmin` + `bootstrapAuthenticatedPage` from e2e-helpers.ts.
 * If E2E credentials are not configured (`E2E_ADMIN_EMAIL` or
 * `E2E_API_TOKEN` env vars unset), the authenticated tests are
 * SKIPPED with a clear message — the public route tests still run.
 *
 * ## Why 15 routes
 *
 * These are the user-facing screens that carry the visual contract
 * with customers. The list is the conservative minimum; expanding to
 * 30-50 in a follow-up wave is a natural extension of the same spec
 * pattern.
 */

interface CriticalRoute {
  name: string;
  path: string;
  authenticated: boolean;
  /**
   * Optional readiness probe — a CSS selector that must be visible
   * before the screenshot is taken. Without this, the screenshot
   * might capture a loading skeleton instead of the rendered page.
   */
  readySelector?: string;
  /**
   * Whether to mask any content that is intentionally non-deterministic
   * (timestamps, random session IDs, etc.). Pass a list of CSS
   * selectors. Playwright will paint the masked regions with a solid
   * color before diffing.
   */
  mask?: string[];
}

const PUBLIC_ROUTES: CriticalRoute[] = [
  { name: 'landing', path: '/', authenticated: false },
  { name: 'login', path: '/login', authenticated: false },
  { name: 'signup', path: '/signup', authenticated: false },
];

const AUTHENTICATED_ROUTES: CriticalRoute[] = [
  { name: 'dashboard', path: '/dashboard', authenticated: true },
  { name: 'products-list', path: '/products', authenticated: true },
  { name: 'products-new', path: '/products/new', authenticated: true },
  // products/:id needs a fixture id; we use a placeholder that the
  // P6.5-3 fix will ensure renders an empty-state instead of crashing.
  {
    name: 'products-edit',
    path: '/products/00000000-0000-0000-0000-000000000000',
    authenticated: true,
  },
  // checkout/:planId is technically a public route but needs a real plan
  // id; we test it as an authenticated screen with a known plan id.
  { name: 'checkout', path: '/checkout/plan-e2e-fixture', authenticated: true },
  { name: 'inbox', path: '/inbox', authenticated: true },
  { name: 'crm', path: '/crm', authenticated: true },
  { name: 'wallet', path: '/wallet', authenticated: true },
  { name: 'settings', path: '/settings', authenticated: true },
  { name: 'billing', path: '/billing', authenticated: true },
  { name: 'kyc', path: '/kyc', authenticated: true },
];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function waitForPublicSurfaceToSettle(page: Page) {
  await page.waitForFunction(() => {
    const banner = document.querySelector('.kloel-cookie-banner');
    if (!banner) {
      return true;
    }

    const style = window.getComputedStyle(banner);
    return (
      (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)') &&
      style.opacity === '1'
    );
  });

  // Give Chromium one extra paint after the banner settles so rounded corners
  // rasterize consistently before the zero-diff screenshot gate runs.
  await page.waitForTimeout(100);
}

test.describe('P6.5-1 — Visual regression baseline (I20)', () => {
  test.describe('Public routes (no auth required)', () => {
    for (const route of PUBLIC_ROUTES) {
      for (const viewport of VIEWPORTS) {
        test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const { frontendUrl } = getE2EBaseUrls();
          await page.goto(`${frontendUrl}${route.path}`, { waitUntil: 'networkidle' });

          if (route.readySelector) {
            await page.waitForSelector(route.readySelector, { state: 'visible', timeout: 10_000 });
          }

          await waitForPublicSurfaceToSettle(page);

          // Mask intentionally non-deterministic regions before the diff.
          const maskLocators = (route.mask ?? []).map((selector) => page.locator(selector));

          await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
            fullPage: true,
            mask: maskLocators,
            // I20 — zero pixel diff. A single deviation fails the gate.
            maxDiffPixelRatio: 0,
          });
        });
      }
    }
  });

  test.describe('Authenticated routes', () => {
    test.beforeEach(async ({ page, request }, testInfo) => {
      // Skip authenticated tests when no E2E credentials are configured.
      // The public-route tests above still run, so the freeze is
      // partially enforced even in environments that lack the auth seed.
      const hasCreds =
        process.env.E2E_API_TOKEN || process.env.E2E_ADMIN_EMAIL || process.env.E2E_ADMIN_PASSWORD;
      if (!hasCreds) {
        testInfo.skip(
          true,
          'E2E credentials not configured (set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or E2E_API_TOKEN)',
        );
        return;
      }

      const auth = await ensureE2EAdmin(request);
      await bootstrapAuthenticatedPage(page, auth);
    });

    for (const route of AUTHENTICATED_ROUTES) {
      for (const viewport of VIEWPORTS) {
        test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const { frontendUrl } = getE2EBaseUrls();
          await page.goto(`${frontendUrl}${route.path}`, { waitUntil: 'networkidle' });

          if (route.readySelector) {
            await page.waitForSelector(route.readySelector, { state: 'visible', timeout: 10_000 });
          }

          const maskLocators = (route.mask ?? []).map((selector) => page.locator(selector));

          await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
            fullPage: true,
            mask: maskLocators,
            maxDiffPixelRatio: 0,
          });
        });
      }
    }
  });
});
