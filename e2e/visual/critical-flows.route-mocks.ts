import type { Page } from '@playwright/test';
import type { CriticalRoute } from './critical-flows.routes';
import {
  VISUAL_CHECKOUT_PRODUCT_DETAIL_FIXTURE,
  VISUAL_CHECKOUT_PRODUCTS_FIXTURE,
  VISUAL_CHECKOUT_PRODUCT_ID,
  VISUAL_CRM_DEALS_FIXTURE,
  VISUAL_CRM_PIPELINE_FIXTURE,
  VISUAL_DASHBOARD_HOME_FIXTURE,
  VISUAL_INBOX_AGENTS_FIXTURE,
  VISUAL_INBOX_CONVERSATIONS_FIXTURE,
  VISUAL_INBOX_MESSAGES_FIXTURE,
  VISUAL_PRODUCT_EDIT_FIXTURE,
  VISUAL_PRODUCT_EDIT_ID,
  VISUAL_WALLET_ANTICIPATIONS_FIXTURE,
  VISUAL_WALLET_BALANCE_FIXTURE,
  VISUAL_WALLET_CHART_FIXTURE,
  VISUAL_WALLET_MONTHLY_FIXTURE,
  VISUAL_WALLET_TRANSACTIONS_FIXTURE,
  VISUAL_WALLET_WITHDRAWALS_FIXTURE,
} from './critical-flows.data';

export async function mockVisualRouteApis(page: Page, route: CriticalRoute) {
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
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_CONVERSATIONS_FIXTURE),
      });
    });
    await page.route('**/inbox/*/agents', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_AGENTS_FIXTURE),
      });
    });
    await page.route('**/inbox/conversations/*/messages', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_INBOX_MESSAGES_FIXTURE),
      });
    });
    return;
  }

  if (route.name === 'crm') {
    await page.route('**/crm/pipelines**', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      const request = requestRoute.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== 'GET' || !pathname.endsWith('/crm/pipelines')) {
        return requestRoute.fallback();
      }
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pipelines: [VISUAL_CRM_PIPELINE_FIXTURE] }),
      });
    });
    await page.route('**/crm/deals**', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      const request = requestRoute.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== 'GET' || !pathname.endsWith('/crm/deals')) {
        return requestRoute.fallback();
      }
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deals: VISUAL_CRM_DEALS_FIXTURE, count: 0 }),
      });
    });
    return;
  }

  if (route.name === 'wallet') {
    await page.route('**/kloel/wallet/*/balance', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_BALANCE_FIXTURE),
      });
    });
    await page.route('**/kloel/wallet/*/transactions', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_TRANSACTIONS_FIXTURE),
      });
    });
    await page.route('**/kloel/wallet/*/chart', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_CHART_FIXTURE),
      });
    });
    await page.route('**/kloel/wallet/*/monthly', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_MONTHLY_FIXTURE),
      });
    });
    await page.route('**/kloel/wallet/*/withdrawals', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_WITHDRAWALS_FIXTURE),
      });
    });
    await page.route('**/kloel/wallet/*/anticipations', async (requestRoute) => {
      if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VISUAL_WALLET_ANTICIPATIONS_FIXTURE),
      });
    });
    return;
  }

  if (route.name !== 'products-edit') {
    return;
  }

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}/urls`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}/coupons`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route(`**/products/${VISUAL_PRODUCT_EDIT_ID}`, async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_PRODUCT_EDIT_FIXTURE),
    });
  });

  await page.route('**/products', async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest() || requestRoute.request().method() !== 'GET') {
      return requestRoute.fallback();
    }
    const pathname = new URL(requestRoute.request().url()).pathname;
    if (!pathname.endsWith('/products')) return requestRoute.fallback();
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ products: [VISUAL_PRODUCT_EDIT_FIXTURE], count: 1 }),
    });
  });

  await page.route('**/checkout/products', async (requestRoute) => {
    if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
    const method = requestRoute.request().method();
    const pathname = new URL(requestRoute.request().url()).pathname;
    if (!pathname.endsWith('/checkout/products')) return requestRoute.fallback();
    if (method === 'GET') {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: VISUAL_CHECKOUT_PRODUCTS_FIXTURE }),
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
    if (requestRoute.request().isNavigationRequest()) return requestRoute.fallback();
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_CHECKOUT_PRODUCT_DETAIL_FIXTURE),
    });
  });
}
