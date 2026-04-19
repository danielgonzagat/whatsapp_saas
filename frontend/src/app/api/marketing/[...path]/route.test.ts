import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../_lib/backend-url', () => ({
  getBackendCandidateUrls: () => ['https://backend.example.com'],
}));

import { GET } from './route';

function createRequest(options?: {
  url?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  body?: string;
}) {
  const headers = new Headers(options?.headers);
  const cookies = new Map(Object.entries(options?.cookies || {}));

  return {
    method: 'GET',
    headers,
    nextUrl: new URL(options?.url || 'https://app.kloel.com/api/marketing/connect/status'),
    cookies: {
      get: (name: string) => {
        const value = cookies.get(name);
        return value ? { name, value } : undefined;
      },
    },
    text: vi.fn(async () => options?.body || ''),
  } as any;
}

describe('marketing proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards shared auth cookies to the marketing upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, channel: 'whatsapp' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    const response = await GET(
      createRequest({
        url: 'https://app.kloel.com/api/marketing/connect/status?source=whatsapp',
        cookies: {
          kloel_access_token: 'cookie-token',
          kloel_workspace_id: 'ws-cookie',
        },
      }),
      {
        params: Promise.resolve({ path: ['connect', 'status'] }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, channel: 'whatsapp' });
    const request = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe(
      'https://backend.example.com/marketing/connect/status?source=whatsapp',
    );
    expect(request.method).toBe('GET');
    expect(request.redirect).toBe('manual');
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(request.headers.get('Authorization')).toBe('Bearer cookie-token');
    expect(request.headers.get('x-workspace-id')).toBe('ws-cookie');
  });

  it('translates upstream login redirects into a 401 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: {
          location: 'https://auth.kloel.com/login?forceAuth=1&next=%2Fmarketing%2Fwhatsapp',
        },
      }),
    );

    const response = await GET(createRequest(), {
      params: Promise.resolve({ path: ['connect', 'status'] }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining('sessão expirou'),
    });
  });
});
