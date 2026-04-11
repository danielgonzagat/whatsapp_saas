import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_lib/backend-url', () => ({
  getBackendCandidateUrls: () => ['https://backend.example.com'],
}));

import { proxyWhatsAppRequest, proxyWhatsAppStream } from './proxy';

function createRequest(options?: {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  body?: string;
}) {
  const headers = new Headers(options?.headers);
  const cookies = new Map(Object.entries(options?.cookies || {}));

  return {
    headers,
    cookies: {
      get: (name: string) => {
        const value = cookies.get(name);
        return value ? { name, value } : undefined;
      },
    },
    text: vi.fn(async () => options?.body || ''),
  } as any;
}

describe('proxyWhatsAppRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards shared auth cookies to the upstream request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ connected: false, status: 'DISCONNECTED' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const result = await proxyWhatsAppRequest(
      createRequest({
        cookies: {
          kloel_access_token: 'cookie-access-token',
          kloel_workspace_id: 'ws-cookie',
        },
      }),
      'GET',
      '/whatsapp-api/session/status',
    );

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ connected: false, status: 'DISCONNECTED' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/whatsapp-api/session/status',
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer cookie-access-token',
          'x-workspace-id': 'ws-cookie',
        }),
      }),
    );
  });

  it('fails loudly when upstream redirects to login instead of returning json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: {
          location: 'https://auth.kloel.com/login?forceAuth=1&next=%2Fmarketing%2Fwhatsapp',
        },
      }),
    );

    await expect(
      proxyWhatsAppRequest(createRequest(), 'GET', '/whatsapp-api/session/qr'),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('fails loudly when upstream returns html instead of json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>login</html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }),
    );

    await expect(
      proxyWhatsAppRequest(createRequest(), 'GET', '/whatsapp-api/session/status'),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('fails loudly when the live stream upstream is not an event stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-sse', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(proxyWhatsAppStream(createRequest(), '/whatsapp-api/live')).rejects.toThrow(
      /Unexpected WhatsApp SSE upstream response/i,
    );
  });
});
