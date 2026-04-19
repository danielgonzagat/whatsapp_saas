import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}));

import { GET } from './route';

function createRequest(headers?: Record<string, string>) {
  return {
    headers: new Headers(headers),
    nextUrl: new URL('https://app.kloel.com/api/user/data-export'),
  } as any;
}

describe('user data-export proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards auth and cookies to the backend export endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'user_123' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      createRequest({
        cookie: 'kloel_auth=abc',
        authorization: 'Bearer app-token',
        'x-forwarded-for': '1.1.1.1',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/user/data-export',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );

    const forwardedHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
    expect(forwardedHeaders.get('Authorization')).toBe('Bearer app-token');
    expect(forwardedHeaders.get('Cookie')).toBe('kloel_auth=abc');
    expect(forwardedHeaders.get('X-Forwarded-For')).toBe('1.1.1.1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: { id: 'user_123' } });
  });
});
