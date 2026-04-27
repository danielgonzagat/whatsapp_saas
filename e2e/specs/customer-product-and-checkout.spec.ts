/**
 * E2E: Customer Product and Checkout
 *
 * Verifies product → checkout flow with exact status assertions.
 * Tests idempotency: same idempotency key twice produces exactly 1 order.
 *
 * truthMode: 'observed' — real HTTP requests against running backend.
 */
import { test, expect } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

test.describe('Customer Product and Checkout', () => {
  // Cold-start auth bootstrap (register + retry login on rate limits) can
  // spend more than 30s on a fresh CI worker. Widen tests + the beforeAll
  // hook to 90s.
  test.describe.configure({ timeout: 90_000 });

  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;
  let token: string;
  let productId: string;
  let assignedId: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000);
    const session = await ensureE2EAdmin(request);
    token = session.token;
  });

  test('POST /products creates product with status 201', async ({ request }) => {
    const res = await request.post(api('/products'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `E2E Checkout Product ${Date.now()}`,
        description: 'Product for checkout E2E test',
        price: 9900,
        category: 'DIGITAL',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    productId = body.id;
    expect(productId).toBeTruthy();
  });

  test('POST /checkout succeeds with status 201 and returns PENDING order', async ({ request }) => {
    expect(productId).toBeTruthy();

    const res = await request.post(api('/checkout'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        items: [{ productId, quantity: 1 }],
        paymentMethod: 'pix',
      },
    });
    expect(res.status()).toBe(201);
    const order = await res.json();
    assignedId = order.id || order.orderId;
    expect(assignedId).toBeTruthy();

    const statusStr = (order.status || '').toLowerCase();
    expect(['pending', 'created']).toContain(statusStr);
  });

  test('idempotency: same key twice produces identical order, not duplicate', async ({
    request,
  }) => {
    expect(productId).toBeTruthy();

    const idempotencyKey = `e2e-idem-${Date.now()}-${randomInt(10_000)}`;

    const first = await request.post(api('/checkout'), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      data: {
        items: [{ productId, quantity: 1 }],
        paymentMethod: 'pix',
      },
    });
    expect(first.status()).toBe(201);
    const firstBody = await first.json();
    const firstId = firstBody.id || firstBody.orderId;
    expect(firstId).toBeTruthy();

    const second = await request.post(api('/checkout'), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      data: {
        items: [{ productId, quantity: 1 }],
        paymentMethod: 'pix',
      },
    });
    expect(second.status()).toBe(201);
    const secondBody = await second.json();
    const secondId = secondBody.id || secondBody.orderId;

    // Idempotency: same key → same order id, NOT a new row
    expect(firstId).toBe(secondId);
  });
});
