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

function createGetRequest(url = 'https://auth.kloel.com/api/auth/callback/apple?id_token=apple-token') {
  return {
    method: 'GET',
    headers: new Headers({ host: 'auth.kloel.com' }),
    nextUrl: new URL(url),
  } as any;
}

function createPostRequest(options?: { user?: string; idToken?: string; host?: string }) {
  const form = new FormData();
  if (options?.idToken !== '') {
    form.set('id_token', options?.idToken || 'apple-token');
  }
  if (options?.user) {
    form.set('user', options.user);
  }

  return {
    method: 'POST',
    headers: new Headers({ host: options?.host || 'auth.kloel.com' }),
    nextUrl: new URL('https://auth.kloel.com/api/auth/callback/apple'),
    formData: vi.fn(async () => form),
  } as any;
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

  it('redirects to login with an explicit reason when the identity token is missing', async () => {
    const response = await POST(createPostRequest({ idToken: '' }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=apple_auth_failed&reason=missing_identity_token',
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
      createGetRequest('https://auth.kloel.com/api/auth/callback/apple?id_token=invalid-token'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=apple_auth_failed&reason=backend_rejected',
    );
    expect(mocks.setSharedAuthCookies).not.toHaveBeenCalled();
  });
});
