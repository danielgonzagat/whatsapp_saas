import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}));

import { GET, POST } from './route';

function createRequest(options?: {
  headers?: Record<string, string>;
  body?: string;
  url?: string;
}) {
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://app.kloel.com/api/webhooks/meta'),
    text: vi.fn(async () => options?.body || ''),
  } as any;
}

describe('meta webhook proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards webhook verification queries and preserves the plain-text challenge', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('123456', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      }),
    );

    const response = await GET(
      createRequest({
        url: 'https://app.kloel.com/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=123456',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=123456',
      expect.objectContaining({
        method: 'GET',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('123456');
  });

  it('forwards raw webhook posts with signature headers intact', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      }),
    );

    const response = await POST(
      createRequest({
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=abc123',
          'x-forwarded-for': '1.1.1.1',
        },
        body: '{"object":"whatsapp_business_account"}',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://backend.example.com/webhooks/meta');
    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers as Headers;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"object":"whatsapp_business_account"}');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Hub-Signature-256')).toBe('sha256=abc123');
    expect(headers.get('X-Forwarded-For')).toBe('1.1.1.1');

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('ok');
  });
});
