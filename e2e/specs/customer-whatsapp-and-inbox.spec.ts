/**
 * E2E: Customer WhatsApp and Inbox
 *
 * Verifies WhatsApp session and inbox endpoints.
 * Skips when WhatsApp is not configured (E2E_WHATSAPP_AVAILABLE != 'true').
 * Does NOT accept 503 or 404 as success.
 *
 * truthMode: 'observed' — real HTTP requests against running backend.
 */
import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

const whatsappAvailable = process.env.E2E_WHATSAPP_AVAILABLE === 'true';

test.describe('Customer WhatsApp and Inbox', () => {
  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;
  let token: string;

  test.beforeAll(async ({ request }) => {
    const session = await ensureE2EAdmin(request);
    token = session.token;
  });

  test('GET /whatsapp/session returns 200 when WhatsApp is configured', async ({ request }) => {
    if (!whatsappAvailable) {
      test.skip(true, 'E2E_WHATSAPP_AVAILABLE is not true — skipping WhatsApp tests');
      return;
    }

    const res = await request.get(api('/whatsapp/session'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    // Session response must contain a status field
    expect(body.status || body.state).toBeDefined();
  });

  test('GET /inbox/conversations returns 200 with array', async ({ request }) => {
    const res = await request.get(api('/inbox/conversations'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    const list = Array.isArray(body) ? body : body.data || body.conversations;
    expect(Array.isArray(list)).toBe(true);
  });

  test('POST /whatsapp/send returns 400 when recipient is missing', async ({ request }) => {
    const res = await request.post(api('/whatsapp/send'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { message: 'E2E test — no recipient' },
    });
    // Must return 400 (validation error), not 200
    expect(res.status()).toBe(400);
  });
});
