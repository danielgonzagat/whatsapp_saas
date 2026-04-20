import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getBackendUrl: vi.fn(() => 'https://backend.example.com'),
  setSharedAuthCookies: vi.fn((_: unknown, response: Response) => response),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock('../../_lib/backend-url', () => ({
  getBackendUrl: mocks.getBackendUrl,
}));

vi.mock('../_lib/shared-auth-cookies', () => ({
  setSharedAuthCookies: mocks.setSharedAuthCookies,
}));

import { POST } from './route';

function createRequest(body: unknown, forwardedFor = '203.0.113.10') {
  return {
    headers: new Headers({ 'x-forwarded-for': forwardedFor, host: 'auth.kloel.com' }),
    json: vi.fn(async () => body),
  } as any;
}

describe('facebook auth proxy route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.revalidateTag.mockReset();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('https://backend.example.com');
    mocks.setSharedAuthCookies.mockReset();
    mocks.setSharedAuthCookies.mockImplementation((_: unknown, response: Response) => response);
  });

  it('proxies the facebook access token to the backend and sets shared cookies on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          workspace: { id: 'ws_123' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(createRequest({ accessToken: 'fb-token', userId: 'fb-user-1' }));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/oauth/facebook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.10',
        }),
        body: JSON.stringify({ accessToken: 'fb-token', userId: 'fb-user-1' }),
      }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(mocks.setSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      workspace: { id: 'ws_123' },
    });
  });

  it('returns 503 when the backend url is not configured', async () => {
    mocks.getBackendUrl.mockReturnValue('');

    const response = await POST(createRequest({ accessToken: 'fb-token' }, ''));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Servidor não configurado.' });
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });
});
