import { type NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getBackendUrl: vi.fn(() => 'https://backend.example.com'),
  setSharedAuthCookies: vi.fn((_: unknown, response: Response) => response),
  buildAppUrl: vi.fn(() => 'https://app.kloel.com/'),
  buildAuthUrl: vi.fn(() => 'https://auth.kloel.com/login'),
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
}));

import { GET, POST } from './route';

const appleState = 'auth-state-1';

function encodeAppleState(nonce = appleState, nextPath?: string): string {
  return Buffer.from(JSON.stringify({ nextPath, nonce })).toString('base64url');
}

function createCookieJar(nonce = appleState, nextPath?: string) {
  return {
    get: vi.fn((name: string) =>
      name === 'kloel_auth_apple_state'
        ? { name, value: encodeAppleState(nonce, nextPath) }
        : undefined,
    ),
  };
}

function createGetRequest(
  url = `https://auth.kloel.com/api/auth/callback/apple?id_token=apple-token&state=${appleState}`,
) {
  const nextUrl = new URL(url);
  return Object.assign(
    {
      method: 'GET',
      url: nextUrl.toString(),
      headers: new Headers({ host: 'auth.kloel.com' }),
    } as NextRequest,
    { nextUrl, cookies: createCookieJar() },
  );
}

function createPostRequest(options?: {
  user?: string;
  idToken?: string;
  state?: string;
  cookieState?: string;
  nextPath?: string;
  host?: string;
}) {
  const form = new FormData();
  if (options?.idToken !== '') {
    form.set('id_token', options?.idToken || 'apple-token');
  }
  if (options?.state !== '') {
    form.set('state', options?.state || appleState);
  }
  if (options?.user) {
    form.set('user', options.user);
  }

  const nextUrl = new URL('https://auth.kloel.com/api/auth/callback/apple');
  return Object.assign(
    {
      method: 'POST',
      url: nextUrl.toString(),
      headers: new Headers({ host: options?.host || 'auth.kloel.com' }),
    } as NextRequest,
    {
      nextUrl,
      cookies: createCookieJar(options?.cookieState || appleState, options?.nextPath),
      formData: vi.fn(async () => form),
    },
  );
}

describe('apple auth callback route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.revalidateTag.mockReset();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('https://backend.example.com');
    mocks.setSharedAuthCookies.mockReset();
    mocks.setSharedAuthCookies.mockImplementation((_: unknown, response: Response) => response);
    mocks.buildAppUrl.mockReset();
    mocks.buildAppUrl.mockReturnValue('https://app.kloel.com/');
    mocks.buildAuthUrl.mockReset();
    mocks.buildAuthUrl.mockReturnValue('https://auth.kloel.com/login');
  });

  it('posts the Apple identity token to the backend and redirects to the app on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          user: { id: 'user_1', email: 'apple@kloel.com' },
          workspace: { id: 'ws_1', name: 'Workspace' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(
      createPostRequest({
        user: JSON.stringify({
          email: 'apple@kloel.com',
          name: { firstName: 'Apple', lastName: 'User' },
        }),
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/oauth/apple',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Forwarded-For': '',
        }),
        body: JSON.stringify({
          identityToken: 'apple-token',
          redirectUri: 'https://auth.kloel.com/api/auth/callback/apple',
          user: {
            email: 'apple@kloel.com',
            name: { firstName: 'Apple', lastName: 'User' },
          },
        }),
      }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith('auth', 'max');
    expect(mocks.setSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.kloel.com/');
  });

  it('redirects to the sanitized next path stored in Apple state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          user: { id: 'user_1', email: 'apple@kloel.com' },
          workspace: { id: 'ws_1', name: 'Workspace' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    mocks.buildAppUrl.mockReturnValue('https://app.kloel.com/billing');

    const response = await POST(createPostRequest({ nextPath: '/billing' }));

    expect(mocks.buildAppUrl).toHaveBeenCalledWith('/billing', 'auth.kloel.com');
    expect(response.headers.get('location')).toBe('https://app.kloel.com/billing');
  });

  it('redirects to login with an explicit reason when the identity token is missing', async () => {
    const response = await POST(createPostRequest({ idToken: '' }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=apple_auth_failed&reason=missing_identity_token',
    );
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });

  it('rejects callbacks that do not match the stored Apple state', async () => {
    const response = await POST(createPostRequest({ state: 'other-state' }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=apple_auth_failed&reason=state_mismatch',
    );
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });

  it('redirects to login when the backend rejects the Apple login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      createGetRequest(
        `https://auth.kloel.com/api/auth/callback/apple?id_token=invalid-token&state=${appleState}`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=apple_auth_failed&reason=backend_rejected',
    );
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });
});
