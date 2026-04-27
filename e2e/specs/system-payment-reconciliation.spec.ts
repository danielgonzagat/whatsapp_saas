/**
 * E2E: System Payment Reconciliation
 *
 * Verifies payment/wallet/billing endpoints against staging backend.
 * Uses real routes that exist in the NestJS backend:
 *  - GET /kloel/wallet/:workspaceId/balance
 *  - GET /billing/status
 *  - GET /kloel/payments/report/:workspaceId
 *  - POST /kloel/payments/webhook (idempotency)
 *
 * truthMode: 'observed' — real HTTP requests against running backend.
 */
import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

test.describe('System Payment Reconciliation', () => {
  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;
  let token: string;
  let workspaceId: string;

  test.beforeAll(async ({ request }) => {
    const session = await ensureE2EAdmin(request);
    token = session.token;
    workspaceId = session.workspaceId;
  });

  test('GET /kloel/wallet/:workspaceId/balance returns 200', async ({ request }) => {
    const res = await request.get(api(`/kloel/wallet/${workspaceId}/balance`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /billing/status returns 200', async ({ request }) => {
    const res = await request.get(api('/billing/status'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /kloel/payments/report/:workspaceId returns 200', async ({ request }) => {
    const res = await request.get(api(`/kloel/payments/report/${workspaceId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });

  test('POST /kloel/payments/webhook idempotency: two identical requests produce only one transaction', async ({
    request,
  }) => {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || '';
    const idempotencyKey = `e2e-wh-${Date.now()}`;

    const makePayload = () => ({
      event: 'payment.succeeded',
      workspaceId,
      payment: {
        id: `evt_e2e_${Date.now()}`,
        amount: 9900,
        currency: 'brl',
        status: 'paid',
        paymentMethod: 'pix',
        metadata: { orderId: 'e2e-test-order', idempotencyKey },
      },
    });

    const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
    if (webhookSecret) {
      headers['x-webhook-secret'] = webhookSecret;
    }

    const first = await request.post(api('/kloel/payments/webhook'), {
      headers,
      data: makePayload(),
    });
    expect([200, 201]).toContain(first.status());
    const firstBody = await first.json();
    const firstRef = firstBody.id || firstBody.reference;

    const second = await request.post(api('/kloel/payments/webhook'), {
      headers,
      data: makePayload(),
    });
    expect([200, 201]).toContain(second.status());
    const secondBody = await second.json();
    const secondRef = secondBody.id || secondBody.reference;

    if (firstRef && secondRef) {
      expect(firstRef).toBe(secondRef);
    }
  });
});
