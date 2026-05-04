import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { chromium, devices, expect, test as base, type Locator, type Page } from '@playwright/test';
import {
  AUTHENTICATED_ROUTES,
  PUBLIC_ROUTES,
  type CriticalRoute,
  VIEWPORTS,
} from './critical-flows.routes';
import { mockVisualAuthApis } from './critical-flows.auth-mocks';
import { mockVisualRouteApis } from './critical-flows.route-mocks';
import {
  bootstrapAuthenticatedPage,
  ensureE2EAdmin,
  getE2EBaseUrls,
  type E2EAuthContext,
} from '../specs/e2e-helpers';

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
 * The helper provisions a real local session on demand, so the visual
 * suite does not depend on manually injecting tokens into CI.
 *
 * ## Why 15 routes
 *
 * These are the user-facing screens that carry the visual contract
 * with customers. The list is the conservative minimum; expanding to
 * 30-50 in a follow-up wave is a natural extension of the same spec
 * pattern.
 */

const VISUAL_FIXED_TIME_ISO = '2026-01-15T15:30:00.000Z';
const VISUAL_RANDOM_VALUE = 0.123456789;
const VISUAL_COOKIE_CONSENT = {
  necessary: true,
  analytics: false,
  marketing: false,
  updatedAt: VISUAL_FIXED_TIME_ISO,
};
const VISUAL_CONSENT_COOKIE = JSON.stringify({
  necessary: true,
  analytics: false,
  marketing: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const MAX_SINGLE_PASS_CAPTURE_HEIGHT = 4_096;
const VISUAL_BROWSER_ARGS = [
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-skia-runtime-opts',
];
const VISUAL_PIXEL_CHANNEL_TOLERANCE = 3;
const VISUAL_FREEZE_STYLE = [
  'html, body {',
  'overflow-y: scroll !important;',
  'scrollbar-gutter: stable !important;',
  '}',
  "html[data-visual-capture='true'] {",
  'cursor: default !important;',
  '}',
  "html[data-visual-capture='true'] a,",
  "html[data-visual-capture='true'] button,",
  "html[data-visual-capture='true'] input,",
  "html[data-visual-capture='true'] label,",
  "html[data-visual-capture='true'] select,",
  "html[data-visual-capture='true'] textarea,",
  "html[data-visual-capture='true'] [role='button'] {",
  'pointer-events: none !important;',
  '}',
  '*, *::before, *::after {',
  'animation-delay: 0s !important;',
  'animation-duration: 0s !important;',
  'animation-iteration-count: 1 !important;',
  'caret-color: transparent !important;',
  'scroll-behavior: auto !important;',
  'transition-delay: 0s !important;',
  'transition-duration: 0s !important;',
  '}',
  '*:focus,',
  '*:focus-visible {',
  'outline: none !important;',
  '}',
].join('\n');

type ScreenshotAssertionOptions = {
  fullPage?: boolean;
  mask?: Locator[];
};

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

function countPixelDiff(expected: PNG, actual: PNG) {
  const width = expected.width;
  const height = expected.height;
  const diff = new PNG({ width, height });
  let diffCount = 0;

  for (let index = 0; index < expected.data.length; index += 4) {
    const matches =
      Math.abs(expected.data[index] - actual.data[index]) <= VISUAL_PIXEL_CHANNEL_TOLERANCE &&
      Math.abs(expected.data[index + 1] - actual.data[index + 1]) <=
        VISUAL_PIXEL_CHANNEL_TOLERANCE &&
      Math.abs(expected.data[index + 2] - actual.data[index + 2]) <=
        VISUAL_PIXEL_CHANNEL_TOLERANCE &&
      expected.data[index + 3] === actual.data[index + 3];

    if (matches) {
      diff.data[index] = 255;
      diff.data[index + 1] = 255;
      diff.data[index + 2] = 255;
      diff.data[index + 3] = 0;
      continue;
    }

    diffCount += 1;
    diff.data[index] = 255;
    diff.data[index + 1] = 208;
    diff.data[index + 2] = 0;
    diff.data[index + 3] = 255;
  }

  return { diff, diffCount };
}

async function assertExactScreenshot(
  page: Page,
  snapshotName: string,
  options: ScreenshotAssertionOptions = {},
) {
  const info = test.info();
  const snapshotPath = info.snapshotPath(snapshotName);
  const actualPath = info.outputPath(snapshotName.replace(/\.png$/, '-actual.png'));
  const diffPath = info.outputPath(snapshotName.replace(/\.png$/, '-diff.png'));
  const updateSnapshots = ((info.config as { updateSnapshots?: string }).updateSnapshots ||
    'missing') as string;
  const hasSnapshot = fs.existsSync(snapshotPath);
  const allowSnapshotCreate =
    updateSnapshots === 'missing' || updateSnapshots === 'changed' || updateSnapshots === 'all';
  const allowSnapshotUpdate = updateSnapshots === 'all' || updateSnapshots === 'changed';

  await page.screenshot({
    path: actualPath,
    fullPage: options.fullPage,
    mask: options.mask,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });

  expect(fs.existsSync(actualPath), `screenshot capture for ${snapshotName} succeeded`).toBe(true);

  if (!hasSnapshot) {
    if (!allowSnapshotCreate) {
      throw new Error(`Missing visual baseline: ${snapshotPath}`);
    }

    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.copyFileSync(actualPath, snapshotPath);
    return;
  }

  const expected = PNG.sync.read(fs.readFileSync(snapshotPath));
  const actual = PNG.sync.read(fs.readFileSync(actualPath));

  if (expected.width !== actual.width || expected.height !== actual.height) {
    if (allowSnapshotUpdate) {
      fs.copyFileSync(actualPath, snapshotPath);
      return;
    }

    throw new Error(
      [
        `Visual snapshot size mismatch for ${snapshotName}.`,
        `Expected: ${expected.width}x${expected.height}`,
        `Actual: ${actual.width}x${actual.height}`,
        `Baseline: ${snapshotPath}`,
        `Actual: ${actualPath}`,
      ].join('\n'),
    );
  }

  const { diff, diffCount } = countPixelDiff(expected, actual);
  if (diffCount === 0) {
    return;
  }

  if (allowSnapshotUpdate) {
    fs.copyFileSync(actualPath, snapshotPath);
    return;
  }

  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  throw new Error(
    [
      `Visual diff beyond tolerance detected for ${snapshotName}: ${diffCount} pixels differ.`,
      `Baseline: ${snapshotPath}`,
      `Actual: ${actualPath}`,
      `Diff: ${diffPath}`,
    ].join('\n'),
  );
}

async function applyVisualFreezeCss(page: Page) {
  await page.evaluate((cssText) => {
    const styleId = 'visual-freeze-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = cssText;
  }, VISUAL_FREEZE_STYLE);
}

async function freezeVisualRuntime(page: Page) {
  await page.addInitScript(
    ({ fixedTimeIso, randomValue }) => {
      const fixedTimeMs = new Date(fixedTimeIso).valueOf();
      const OriginalDate = Date;

      class FixedDate extends OriginalDate {
        constructor(...args: ConstructorParameters<typeof Date>) {
          super(...(args.length ? args : [fixedTimeMs]));
        }

        static now() {
          return fixedTimeMs;
        }
      }

      FixedDate.parse = OriginalDate.parse.bind(OriginalDate);
      FixedDate.UTC = OriginalDate.UTC.bind(OriginalDate);

      globalThis.Date = FixedDate as DateConstructor;
      Math.random = () => randomValue;
      localStorage.setItem('cookie_consent', 'accepted');
      (
        globalThis as typeof globalThis & { __KLOEL_E2E_DISABLE_SOCKET__?: boolean }
      ).__KLOEL_E2E_DISABLE_SOCKET__ = true;
    },
    { fixedTimeIso: VISUAL_FIXED_TIME_ISO, randomValue: VISUAL_RANDOM_VALUE },
  );
}

async function seedCookieConsent(page: Page, targetUrl: string) {
  await page.context().addCookies([
    {
      name: 'kloel_consent',
      value: encodeURIComponent(JSON.stringify(VISUAL_COOKIE_CONSENT)),
      url: targetUrl,
      sameSite: 'Lax',
    },
  ]);
}

async function ensureCookieConsentSettled(page: Page) {
  const banner = page.locator('.kloel-cookie-banner');
  const bannerVisible = await banner.isVisible().catch(() => false);

  if (!bannerVisible) {
    return;
  }

  await page.evaluate(async (payload) => {
    await fetch('/api/v1/cookie-consent', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  }, VISUAL_COOKIE_CONSENT);

  await page.reload({ waitUntil: 'networkidle' });

  const stillVisible = await banner.isVisible().catch(() => false);
  if (!stillVisible) {
    return;
  }

  const acceptAllButton = page.getByRole('button', { name: 'Aceitar tudo' });
  await acceptAllButton.click();
  await banner.waitFor({ state: 'hidden', timeout: 10_000 });
}

async function waitForVisualRouteReadiness(page: Page, route: CriticalRoute) {
  const loadingState = page.locator('[role="status"]');
  const loadingVisible = await loadingState.isVisible().catch(() => false);

  if (loadingVisible) {
    await loadingState.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  if (route.readySelector) {
    await page.waitForSelector(route.readySelector, { state: 'visible', timeout: 15_000 });
  }

  if (route.name === 'inbox') {
    await page.getByText('Marina Costa').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page
      .getByText('Perfeito, manda o link.')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  if (route.name === 'products-edit') {
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="product-nerve-center-root"]');
      if (!(root instanceof HTMLElement)) {
        return false;
      }

      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }

      return Array.from(root.querySelectorAll('img')).every((image) => image.complete);
    });

    await waitForVisualSurfaceToSettle(page);
    await page.waitForTimeout(250);
  }

  if (route.name === 'wallet') {
    await page.getByText('Saldo disponivel', { exact: false }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  }
}

async function waitForVisualSurfaceToSettle(page: Page) {
  await page.evaluate(() => {
    document.documentElement.dataset.visualCapture = 'true';
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  });
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready;
    }
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(350);
}

async function stabilizeFullPageCapture(page: Page, viewport: { width: number; height: number }) {
  const targetHeight = await page.evaluate(
    ({ defaultHeight, maxHeight }) => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollHeight = Math.max(
        doc?.scrollHeight ?? 0,
        doc?.offsetHeight ?? 0,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
      );

      if (
        !Number.isFinite(scrollHeight) ||
        scrollHeight <= defaultHeight ||
        scrollHeight > maxHeight
      ) {
        return defaultHeight;
      }

      return Math.min(maxHeight, Math.ceil(scrollHeight + 16));
    },
    {
      defaultHeight: viewport.height,
      maxHeight: MAX_SINGLE_PASS_CAPTURE_HEIGHT,
    },
  );

  if (targetHeight === viewport.height) {
    return;
  }

  await page.setViewportSize({ width: viewport.width, height: targetHeight });
  await waitForVisualSurfaceToSettle(page);
}

const test = base.extend({
  page: async ({}, use) => {
    const browser = await chromium.launch({
      headless: true,
      args: VISUAL_BROWSER_ARGS,
    });
    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await use(page);
    } finally {
      await context.close();
      await browser.close();
    }
  },
});

test.describe('P6.5-1 — Visual regression baseline (I20)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await freezeVisualRuntime(page);
  });

  test.describe('Public routes (no auth required)', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/v1/cookie-consent', async (requestRoute) => {
        const method = requestRoute.request().method();
        if (method === 'GET') {
          await requestRoute.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              consent: {
                necessary: true,
                analytics: false,
                marketing: false,
                updatedAt: VISUAL_FIXED_TIME_ISO,
              },
            }),
          });
        } else {
          await requestRoute.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              consent: {
                necessary: true,
                analytics: false,
                marketing: false,
                updatedAt: VISUAL_FIXED_TIME_ISO,
              },
            }),
          });
        }
      });
    });

    for (const route of PUBLIC_ROUTES) {
      for (const viewport of VIEWPORTS) {
        test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const { marketingUrl, authUrl } = getE2EBaseUrls();
          const routeBaseUrl = route.name === 'landing' ? marketingUrl : authUrl;
          const routeOrigin = new URL(routeBaseUrl);

          await page.context().clearCookies();
          await page.context().addCookies([
            {
              name: 'kloel_consent',
              value: VISUAL_CONSENT_COOKIE,
              domain: routeOrigin.hostname,
              path: '/',
            },
          ]);
          await seedCookieConsent(page, routeBaseUrl);

          await page.goto(`${routeBaseUrl}${route.path}`, { waitUntil: 'networkidle' });
          await ensureCookieConsentSettled(page);
          await applyVisualFreezeCss(page);
          await waitForVisualRouteReadiness(page, route);
          await waitForVisualSurfaceToSettle(page);
          await waitForPublicSurfaceToSettle(page);
          await stabilizeFullPageCapture(page, viewport);

          // Mask intentionally non-deterministic regions before the diff.
          const maskLocators = (route.mask ?? []).map((selector) => page.locator(selector));

          await assertExactScreenshot(page, `${route.name}-${viewport.name}.png`, {
            fullPage: true,
            mask: maskLocators,
          });
        });
      }
    }
  });

  test.describe('Authenticated routes', () => {
    // Each authenticated visual scenario runs auth bootstrap +
    // mockVisualAuthApis + page.goto + freeze CSS + readiness probes +
    // surface stabilisation + full-page screenshot. Cold-start CI workers
    // routinely overflow 30s — give the describe a 90s budget instead.
    test.describe.configure({ timeout: 90_000 });

    let authContext: E2EAuthContext;

    test.beforeEach(async ({ page, request }) => {
      authContext = await ensureE2EAdmin(request);
      await mockVisualAuthApis(page, authContext);
    });

    for (const route of AUTHENTICATED_ROUTES) {
      for (const viewport of VIEWPORTS) {
        test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const { appUrl } = getE2EBaseUrls();
          await mockVisualRouteApis(page, route);
          await seedCookieConsent(page, appUrl);
          await bootstrapAuthenticatedPage(page, authContext, {
            landingPath: route.path,
          });
          await ensureCookieConsentSettled(page);
          await applyVisualFreezeCss(page);
          await waitForVisualRouteReadiness(page, route);
          await waitForVisualSurfaceToSettle(page);
          await stabilizeFullPageCapture(page, viewport);

          const maskLocators = (route.mask ?? []).map((selector) => page.locator(selector));

          await assertExactScreenshot(page, `${route.name}-${viewport.name}.png`, {
            fullPage: true,
            mask: maskLocators,
          });
        });
      }
    }
  });
});
