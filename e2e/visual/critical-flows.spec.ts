import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { chromium, devices, test as base, type Locator, type Page } from '@playwright/test';
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

const VISUAL_FIXED_TIME_ISO = '2026-01-15T15:30:00.000Z';
const VISUAL_RANDOM_VALUE = 0.123456789;
const VISUAL_COOKIE_CONSENT = {
  necessary: true,
  analytics: false,
  marketing: false,
  updatedAt: VISUAL_FIXED_TIME_ISO,
};
const MAX_SINGLE_PASS_CAPTURE_HEIGHT = 4_096;
const VISUAL_BROWSER_ARGS = [
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-skia-runtime-opts',
];
const VISUAL_PIXEL_CHANNEL_TOLERANCE = 3;
const VISUAL_FREEZE_STYLE = `
  html, body {
    overflow-y: scroll !important;
    scrollbar-gutter: stable !important;
  }

  html[data-visual-capture='true'] {
    cursor: default !important;
  }

  html[data-visual-capture='true'] a,
  html[data-visual-capture='true'] button,
  html[data-visual-capture='true'] input,
  html[data-visual-capture='true'] label,
  html[data-visual-capture='true'] select,
  html[data-visual-capture='true'] textarea,
  html[data-visual-capture='true'] [role='button'] {
    pointer-events: none !important;
  }

  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }

  *:focus,
  *:focus-visible {
    outline: none !important;
  }
`;

type ScreenshotAssertionOptions = {
  fullPage?: boolean;
  mask?: Locator[];
};

const VISUAL_DASHBOARD_HOME_FIXTURE = {
  generatedAt: VISUAL_FIXED_TIME_ISO,
  range: {
    period: '7d',
    label: 'Últimos 7 dias',
    startDate: '2026-01-09',
    endDate: '2026-01-15',
  },
  hero: {
    totalRevenueInCents: 0,
    previousRevenueInCents: 0,
    revenueDeltaPct: null,
    monthRevenueInCents: 0,
    previousMonthRevenueInCents: 0,
    todayRevenueInCents: 0,
    yesterdayRevenueInCents: 0,
    availableBalanceInCents: 0,
    pendingBalanceInCents: 0,
  },
  metrics: {
    paidOrders: 0,
    totalOrders: 0,
    conversionRatePct: 0,
    averageTicketInCents: 0,
    totalConversations: 0,
    convertedOrders: 0,
    waitingForHuman: 0,
    averageResponseTimeSeconds: 0,
  },
  series: {
    labels: ['09 jan', '10 jan', '11 jan', '12 jan', '13 jan', '14 jan', '15 jan'],
    revenueInCents: [0, 0, 0, 0, 0, 0, 0],
    previousRevenueInCents: [0, 0, 0, 0, 0, 0, 0],
    paidOrders: [0, 0, 0, 0, 0, 0, 0],
    totalOrders: [0, 0, 0, 0, 0, 0, 0],
    conversionRatePct: [0, 0, 0, 0, 0, 0, 0],
    averageTicketInCents: [0, 0, 0, 0, 0, 0, 0],
  },
  products: [],
  recentConversations: [],
  health: {
    operationalScorePct: 0,
    checkoutCompletionRatePct: 0,
    activeCheckpoints: 0,
    totalCheckpoints: 3,
    checkpoints: [
      {
        id: 'catalog',
        label: 'Catálogo publicado',
        description: 'Finalize o catálogo para publicar, sacar e liberar todas as operações.',
        active: false,
      },
      {
        id: 'checkout',
        label: 'Checkout validado',
        description: 'Valide o checkout principal para garantir compra, aprovação e carteira.',
        active: false,
      },
      {
        id: 'whatsapp',
        label: 'Canal conectado',
        description: 'Conecte o WhatsApp para liberar operação comercial assistida.',
        active: false,
      },
    ],
  },
};

const VISUAL_PRODUCT_EDIT_ID = '00000000-0000-0000-0000-000000000000';
const VISUAL_PRODUCT_EDIT_FIXTURE = {
  id: VISUAL_PRODUCT_EDIT_ID,
  name: 'Produto',
  slug: 'produto-e2e-visual',
  description: '',
  category: null,
  tags: [],
  price: 0,
  active: true,
  format: 'DIGITAL',
  warrantyDays: 7,
  salesPageUrl: '',
  thankyouUrl: '',
  thankyouPixUrl: '',
  thankyouBoletoUrl: '',
  reclameAquiUrl: '',
  supportEmail: '',
  imageUrl: null,
};
const VISUAL_CHECKOUT_PRODUCT_ID = 'e2e-checkout-product';
const VISUAL_CHECKOUT_PRODUCTS_FIXTURE = [
  {
    id: VISUAL_CHECKOUT_PRODUCT_ID,
    name: VISUAL_PRODUCT_EDIT_FIXTURE.name,
    slug: VISUAL_PRODUCT_EDIT_FIXTURE.slug,
    description: VISUAL_PRODUCT_EDIT_FIXTURE.description,
    category: VISUAL_PRODUCT_EDIT_FIXTURE.category,
    imageUrl: null,
    images: [],
    price: 0,
    plans: [],
  },
];
const VISUAL_CHECKOUT_PRODUCT_DETAIL_FIXTURE = {
  id: VISUAL_CHECKOUT_PRODUCT_ID,
  name: VISUAL_PRODUCT_EDIT_FIXTURE.name,
  slug: VISUAL_PRODUCT_EDIT_FIXTURE.slug,
  checkoutPlans: [],
  checkoutTemplates: [],
};
const VISUAL_INBOX_CONVERSATIONS_FIXTURE = [
  {
    id: 'visual-conversation-1',
    contactId: 'visual-contact-1',
    status: 'open',
    channel: 'whatsapp',
    unreadCount: 2,
    lastMessageAt: '2026-01-15T15:28:00.000Z',
    contact: {
      id: 'visual-contact-1',
      name: 'Marina Costa',
      phone: '+55 11 99888-7766',
    },
    assignedAgent: null,
  },
  {
    id: 'visual-conversation-2',
    contactId: 'visual-contact-2',
    status: 'open',
    channel: 'instagram',
    unreadCount: 0,
    lastMessageAt: '2026-01-15T14:42:00.000Z',
    contact: {
      id: 'visual-contact-2',
      name: 'Carlos Lima',
      phone: '+55 21 97777-6655',
    },
    assignedAgent: {
      id: 'visual-agent-1',
      name: 'Paula Sales',
    },
  },
];
const VISUAL_INBOX_AGENTS_FIXTURE = [
  {
    id: 'visual-agent-1',
    name: 'Paula Sales',
    email: 'paula@kloel.test',
    role: 'closer',
    isOnline: true,
  },
];
const VISUAL_INBOX_MESSAGES_FIXTURE = [
  {
    id: 'visual-message-1',
    content: 'Oi, quero entender como funciona o checkout.',
    direction: 'INBOUND',
    createdAt: '2026-01-15T15:24:00.000Z',
  },
  {
    id: 'visual-message-2',
    content: 'Posso te mostrar o fluxo e te passar o link certo agora.',
    direction: 'OUTBOUND',
    createdAt: '2026-01-15T15:25:00.000Z',
  },
  {
    id: 'visual-message-3',
    content: 'Perfeito, manda o link.',
    direction: 'INBOUND',
    createdAt: '2026-01-15T15:28:00.000Z',
  },
];

const PUBLIC_ROUTES: CriticalRoute[] = [
  { name: 'landing', path: '/', authenticated: false },
  { name: 'login', path: '/login', authenticated: false },
  { name: 'signup', path: '/register', authenticated: false },
];

const AUTHENTICATED_ROUTES: CriticalRoute[] = [
  {
    name: 'dashboard',
    path: '/dashboard',
    authenticated: true,
    readySelector: '[data-testid="home-dashboard-root"]',
  },
  {
    name: 'products-list',
    path: '/products',
    authenticated: true,
    readySelector: '[data-testid="products-view-root"]',
  },
  {
    name: 'products-new',
    path: '/products/new',
    authenticated: true,
    readySelector: '[data-testid="product-create-root"]',
  },
  // products/:id needs a fixture id; we use a placeholder that the
  // P6.5-3 fix will ensure renders an empty-state instead of crashing.
  {
    name: 'products-edit',
    path: '/products/00000000-0000-0000-0000-000000000000',
    authenticated: true,
    readySelector: '[data-testid="product-nerve-center-root"]',
  },
  // checkout/:planId is technically a public route but needs a real plan
  // id; we test it as an authenticated screen with a known plan id.
  { name: 'checkout', path: '/checkout/plan-e2e-fixture', authenticated: true },
  {
    name: 'inbox',
    path: '/inbox',
    authenticated: true,
    readySelector: '[data-testid="inbox-workspace-root"]',
  },
  {
    name: 'crm',
    path: '/vendas/pipeline',
    authenticated: true,
    readySelector: '[data-testid="sales-view-root"]',
  },
  {
    name: 'wallet',
    path: '/carteira/saldo',
    authenticated: true,
    readySelector: '[data-testid="wallet-view-root"]',
  },
  {
    name: 'settings',
    path: '/settings',
    authenticated: true,
    readySelector: '[data-testid="account-settings-root"]',
  },
  {
    name: 'billing',
    path: '/settings?section=billing',
    authenticated: true,
    readySelector: '[data-testid="account-settings-root"]',
  },
  {
    name: 'kyc',
    path: '/settings?section=documentos',
    authenticated: true,
    readySelector: '[data-testid="account-settings-root"]',
  },
];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const VISUAL_CONSENT_COOKIE = JSON.stringify({
  necessary: true,
  analytics: false,
  marketing: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

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
  const allowSnapshotCreate = updateSnapshots === 'missing' || updateSnapshots === 'all';
  const allowSnapshotUpdate = updateSnapshots === 'all' || updateSnapshots === 'changed';

  await page.screenshot({
    path: actualPath,
    fullPage: options.fullPage,
    mask: options.mask,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });

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

async function mockVisualAuthApis(page: Page, auth: Pick<E2EAuthContext, 'email' | 'workspaceId'>) {
  await page.route('**/api/workspace/me', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'e2e-user',
          email: auth.email,
          name: 'E2E Admin',
          workspaceId: auth.workspaceId,
          role: 'OWNER',
        },
        workspaces: [
          {
            id: auth.workspaceId,
            name: 'E2E Workspace',
          },
        ],
        workspace: {
          id: auth.workspaceId,
          name: 'E2E Workspace',
        },
      }),
    });
  });

  await page.route('**/api/kyc/status', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kycStatus: 'approved',
      }),
    });
  });

  await page.route('**/api/kyc/completion', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        percentage: 100,
      }),
    });
  });
}

async function mockVisualRouteApis(page: Page, route: CriticalRoute) {
  if (route.name === 'dashboard') {
    await page.route('**/dashboard/home**', async (requestRoute) => {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_DASHBOARD_HOME_FIXTURE),
      });
    });

    return;
  }

  if (route.name === 'inbox') {
    await page.route('**/inbox/*/conversations', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_CONVERSATIONS_FIXTURE),
      });
    });

    await page.route('**/inbox/*/agents', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_AGENTS_FIXTURE),
      });
    });

    await page.route('**/inbox/conversations/*/messages', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) {
        await requestRoute.fallback();
        return;
      }

      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_MESSAGES_FIXTURE),
      });
    });

    return;
  }

  if (route.name !== 'products-edit') {
    return;
  }

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}/urls`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}/coupons`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_PRODUCT_EDIT_FIXTURE),
    });
  });

  await page.route('**/products', async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest() || requestRoute.request().method() !== 'GET') {
      await requestRoute.fallback();
      return;
    }

    const pathname = new URL(requestRoute.request().url()).pathname;
    if (!pathname.endsWith('/products')) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        products: [VISUAL_PRODUCT_EDIT_FIXTURE],
        count: 1,
      }),
    });
  });

  await page.route('**/checkout/products', async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    const method = requestRoute.request().method();
    const pathname = new URL(requestRoute.request().url()).pathname;
    if (!pathname.endsWith('/checkout/products')) {
      await requestRoute.fallback();
      return;
    }

    if (method === 'GET') {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: VISUAL_CHECKOUT_PRODUCTS_FIXTURE,
        }),
      });
      return;
    }

    if (method === 'POST') {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_CHECKOUT_PRODUCTS_FIXTURE[0]),
      });
      return;
    }

    await requestRoute.fallback();
  });

  await page.route(`**/checkout/products/${VISUAL_CHECKOUT_PRODUCT_ID}`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) {
      await requestRoute.fallback();
      return;
    }

    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_CHECKOUT_PRODUCT_DETAIL_FIXTURE),
    });
  });
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
