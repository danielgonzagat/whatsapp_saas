import { type NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  APPLE_CLIENT_ID: 'com.kloel.web',
  NEXT_PUBLIC_APPLE_CLIENT_ID: '',
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    NextResponse: {
      redirect: (url: URL | string) => {
        const u = typeof url === 'string' ? new URL(url) : url;
        return new Response(null, {
          status: 307,
          headers: { location: u.toString() },
        });
      },
    },
  };
});

import { GET } from './route';

function createGetRequest(host = 'auth.kloel.com') {
  const nextUrl = new URL('https://auth.kloel.com/api/auth/apple/start');
  return Object.assign(
    {
      method: 'GET',
      url: nextUrl.toString(),
      headers: new Headers({ host }),
    } as NextRequest,
    { nextUrl },
  );
}

describe('apple auth start route', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_CLIENT_ID', env.APPLE_CLIENT_ID);
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', env.NEXT_PUBLIC_APPLE_CLIENT_ID);
  });

  it('redirects to Apple with correct parameters', async () => {
    const response = await GET(createGetRequest());

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    const appleUrl = new URL(location);

    expect(appleUrl.origin).toBe('https://appleid.apple.com');
    expect(appleUrl.pathname).toBe('/auth/authorize');
    expect(appleUrl.searchParams.get('client_id')).toBe('com.kloel.web');
    expect(appleUrl.searchParams.get('redirect_uri')).toBe(
      'https://auth.kloel.com/api/auth/callback/apple',
    );
    expect(appleUrl.searchParams.get('response_type')).toBe('code id_token');
    expect(appleUrl.searchParams.get('scope')).toBe('name email');
    expect(appleUrl.searchParams.get('response_mode')).toBe('form_post');
    expect(appleUrl.searchParams.get('state')).toBeTruthy();
  });

  it('uses NEXT_PUBLIC_APPLE_CLIENT_ID as fallback when APPLE_CLIENT_ID is empty', async () => {
    vi.stubEnv('APPLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', 'com.kloel.fallback');

    const response = await GET(createGetRequest());

    const location = response.headers.get('location')!;
    const appleUrl = new URL(location);
    expect(appleUrl.searchParams.get('client_id')).toBe('com.kloel.fallback');
  });

  it('redirects to login with error when client id is not configured', async () => {
    vi.stubEnv('APPLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', '');

    const response = await GET(createGetRequest());

    expect(response.status).toBe(307);
    const location = response.headers.get('location')!;
    const loginUrl = new URL(location);
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('error')).toBe('apple_auth_failed');
    expect(loginUrl.searchParams.get('reason')).toBe('not_configured');
  });

  it('respects the host header for error redirect', async () => {
    vi.stubEnv('APPLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_APPLE_CLIENT_ID', '');

    const response = await GET(createGetRequest('auth.staging.kloel.com'));

    const location = response.headers.get('location')!;
    const loginUrl = new URL(location);
    expect(loginUrl.host).toBe('auth.staging.kloel.com');
    expect(loginUrl.pathname).toBe('/login');
  });

  it('builds redirect_uri from the request origin', async () => {
    const req = createGetRequest('auth.staging.kloel.com');
    const nextUrl = new URL('https://auth.staging.kloel.com/api/auth/apple/start');
    Object.assign(req, { nextUrl });

    const response = await GET(req);

    const location = response.headers.get('location')!;
    const appleUrl = new URL(location);
    expect(appleUrl.searchParams.get('redirect_uri')).toBe(
      'https://auth.staging.kloel.com/api/auth/callback/apple',
    );
  });
});
