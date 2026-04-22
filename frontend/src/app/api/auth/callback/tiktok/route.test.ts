import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getBackendUrl: vi.fn(() => 'https://backend.example.com'),
  setSharedAuthCookies: vi.fn((_: unknown, response: Response) => response),
  buildAppUrl: vi.fn((path = '/') => `https://app.kloel.com${path}`),
  buildAuthUrl: vi.fn(() => 'https://auth.kloel.com/login'),
  sanitizeNextPath: vi.fn((path: string | null | undefined, fallback = '/') => path || fallback),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock('../../../_lib/backend-url', () => ({
  getBackendUrl: mocks.getBackendUrl,
}));

vi.mock('../../_lib/shared-auth-cookies', () => ({
  setSharedAuthCookies: mocks.setSharedAuthCookies,
}));

vi.mock('@/lib/subdomains', () => ({
  buildAppUrl: mocks.buildAppUrl,
  buildAuthUrl: mocks.buildAuthUrl,
  sanitizeNextPath: mocks.sanitizeNextPath,
}));

import { GET } from './route';

function createRequest(options?: {
  url?: string;
  stateCookie?: string;
  nextCookie?: string;
  host?: string;
  forwardedFor?: string;
}) {
  return {
    headers: new Headers({
      host: options?.host || 'auth.kloel.com',
      'x-forwarded-for': options?.forwardedFor || '203.0.113.10',
    }),
    nextUrl: new URL(
      options?.url ||
        'https://auth.kloel.com/api/auth/callback/tiktok?code=tiktok-code&state=tiktok-state',
    ),
    cookies: {
      get: vi.fn((name: string) => {
        if (name === 'kloel_tiktok_oauth_state' && options?.stateCookie) {
          return { value: options.stateCookie };
        }
        if (name === 'kloel_tiktok_oauth_next' && options?.nextCookie) {
          return { value: options.nextCookie };
        }
        return undefined;
      }),
    },
  } as any;
}

describe('tiktok auth callback route', () => {
  const originalClientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const originalClientSecret = process.env.TIKTOK_CLIENT_SECRET;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.revalidateTag.mockReset();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('https://backend.example.com');
    mocks.setSharedAuthCookies.mockReset();
    mocks.setSharedAuthCookies.mockImplementation((_: unknown, response: Response) => response);
    mocks.buildAppUrl.mockReset();
    mocks.buildAppUrl.mockImplementation((path = '/') => `https://app.kloel.com${path}`);
    mocks.buildAuthUrl.mockReset();
    mocks.buildAuthUrl.mockReturnValue('https://auth.kloel.com/login');
    mocks.sanitizeNextPath.mockReset();
    mocks.sanitizeNextPath.mockImplementation(
      (path: string | null | undefined, fallback = '/') => path || fallback,
    );
    process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY = 'tiktok-client-key';
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-client-secret';
  });

  afterEach(() => {
    if (originalClientKey === undefined) {
      delete process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
    } else {
      process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY = originalClientKey;
    }

    if (originalClientSecret === undefined) {
      delete process.env.TIKTOK_CLIENT_SECRET;
    } else {
      process.env.TIKTOK_CLIENT_SECRET = originalClientSecret;
    }
  });

  it('posts the TikTok code to the backend and redirects to the app on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'tt-access-token',
            refresh_token: 'tt-refresh-token',
            expires_in: 3600,
            open_id: 'tt-open-id',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            user: { id: 'user_1', email: 'tiktok-user@oauth.kloel.local' },
            workspace: { id: 'ws_1', name: 'Workspace' },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    const response = await GET(
      createRequest({
        stateCookie: 'tiktok-state',
        nextCookie: encodeURIComponent('/billing'),
      }),
    );

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://open.tiktokapis.com/v2/oauth/token/',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://backend.example.com/auth/oauth/tiktok',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.10',
        }),
        body: JSON.stringify({
          accessToken: 'tt-access-token',
          openId: 'tt-open-id',
          refreshToken: 'tt-refresh-token',
          expiresInSeconds: 3600,
        }),
      }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(mocks.setSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.kloel.com/billing?auth=1');
  });

  it('redirects to login when the OAuth state does not match', async () => {
    const response = await GET(
      createRequest({
        stateCookie: 'stored-state',
        nextCookie: encodeURIComponent('/billing'),
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=tiktok_auth_failed&reason=state_mismatch&next=%2Fbilling',
    );
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });

  it('redirects to login when the backend rejects the TikTok login', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'tt-access-token',
            refresh_token: 'tt-refresh-token',
            expires_in: 3600,
            open_id: 'tt-open-id',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const response = await GET(
      createRequest({
        stateCookie: 'tiktok-state',
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=tiktok_auth_failed&reason=backend_rejected',
    );
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });

  it('redirects to login when TikTok token exchange fails on the auth domain', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      createRequest({
        stateCookie: 'tiktok-state',
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=tiktok_auth_failed&reason=token_exchange_failed',
    );
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });
});
