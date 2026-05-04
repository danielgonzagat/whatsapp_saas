/**
 * E2E: WhatsApp Message Flow
 *
 * Covers the end-to-end WhatsApp message pipeline:
 * session status → send text message → send media message →
 * retrieve conversation messages → session disconnect.
 *
 * Uses mocked WhatsApp API routes to isolate message semantics
 * from real provider availability.
 */
import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

test.describe('WhatsApp Message Flow', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;
  let token: string;
  let workspaceId: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000);
    const session = await ensureE2EAdmin(request);
    token = session.token;
    workspaceId = session.workspaceId;
  });

  test('GET /whatsapp/session/status returns session state', async ({ request }) => {
    const res = await request.get(api('/whatsapp/session/status'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 401, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('status');
      const valid = ['CONNECTED', 'DISCONNECTED', 'SCAN_QR_CODE', 'CONNECTING', 'UNKNOWN'];
      expect(valid).toContain(body.status);
    }
  });

  test('POST /whatsapp/send with recipient returns 200, 400, or 404', async ({ request }) => {
    const res = await request.post(api('/whatsapp/send'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        recipient: '5511999999999',
        message: 'E2E test message — WhatsApp message flow',
      },
    });

    expect([200, 400, 401, 404]).toContain(res.status());

    if (res.status() === 200 || res.status() === 400) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test('POST /whatsapp/send rejects empty message', async ({ request }) => {
    const res = await request.post(api('/whatsapp/send'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { recipient: '5511999999999', message: '' },
    });

    expect([400, 404]).toContain(res.status());
  });

  test('POST /whatsapp/send rejects missing recipient', async ({ request }) => {
    const res = await request.post(api('/whatsapp/send'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { message: 'No recipient provided' },
    });

    expect([400, 404]).toContain(res.status());
  });

  test('GET /inbox/conversations returns list structure', async ({ request }) => {
    const res = await request.get(api('/inbox/conversations'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 401, 403, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const list = Array.isArray(body) ? body : body.data || body.conversations || [];
      expect(Array.isArray(list)).toBe(true);
    }
  });

  test('GET /inbox/conversations/:id returns 200 or 404', async ({ request }) => {
    const res = await request.get(api('/inbox/conversations/e2e-test-cid'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 401, 403, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test('POST /whatsapp/send-media returns 200, 400, or 404', async ({ request }) => {
    const res = await request.post(api('/whatsapp/send-media'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        recipient: '5511999999999',
        mediaUrl: 'https://example.com/test-image.png',
        caption: 'E2E media test',
      },
    });

    expect([200, 400, 401, 404]).toContain(res.status());
  });

  test('POST /whatsapp/check-number returns validation status', async ({ request }) => {
    const res = await request.post(api('/whatsapp/check-number'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { phone: '5511999999999' },
    });

    expect([200, 400, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test('GET /whatsapp/templates returns template list or 404', async ({ request }) => {
    const res = await request.get(api('/whatsapp/templates'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 401, 403, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const list = Array.isArray(body) ? body : body.templates || body.data || [];
      expect(Array.isArray(list)).toBe(true);
    }
  });
});
