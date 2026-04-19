import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}));

import { GET } from './route';

function createRequest(headers?: Record<string, string>) {
  return {
    headers: new Headers(headers),
  } as any;
}

describe('user google-profile-extended proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards auth, cookies, and Google access token headers to the backend route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: 'google',
          email: 'daniel@kloel.com',
          phone: '+5562999990000',
          birthday: '1994-04-18',
          address: null,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const response = await GET(
      createRequest({
        cookie: 'kloel_auth=abc',
        authorization: 'Bearer app-token',
        'x-forwarded-for': '1.1.1.1',
        'x-google-access-token': 'google-access-token',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://backend.example.com/user/google-profile-extended',
    );
    const init = fetchSpy.mock.calls[0]?.[1];
    const forwardedHeaders = init?.headers as Record<string, string>;
    expect(init?.method).toBe('GET');
    expect(forwardedHeaders.Cookie).toBe('kloel_auth=abc');
    expect(forwardedHeaders.Authorization).toBe('Bearer app-token');
    expect(forwardedHeaders['X-Forwarded-For']).toBe('1.1.1.1');
    expect(forwardedHeaders['X-Google-Access-Token']).toBe('google-access-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      provider: 'google',
      email: 'daniel@kloel.com',
      phone: '+5562999990000',
      birthday: '1994-04-18',
      address: null,
    });
  });
});
