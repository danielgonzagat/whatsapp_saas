import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildAuthUrl: vi.fn(() => 'https://auth.kloel.com/login'),
  sanitizeNextPath: vi.fn((path: string | null | undefined, fallback = '/') => path || fallback),
}));

vi.mock('@/lib/subdomains', () => ({
  buildAuthUrl: mocks.buildAuthUrl,
  sanitizeNextPath: mocks.sanitizeNextPath,
}));

import { GET } from './route';

function createRequest(url = 'https://auth.kloel.com/api/auth/tiktok/start?next=/billing') {
  return {
    headers: new Headers({ host: 'auth.kloel.com' }),
    nextUrl: new URL(url),
  } as any;
}

describe('tiktok auth start route', () => {
  const originalClientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;

  beforeEach(() => {
    mocks.buildAuthUrl.mockReset();
    mocks.buildAuthUrl.mockReturnValue('https://auth.kloel.com/login');
    mocks.sanitizeNextPath.mockReset();
    mocks.sanitizeNextPath.mockImplementation(
      (path: string | null | undefined, fallback = '/') => path || fallback,
    );

    process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY = 'tiktok-client-key';
  });

  afterEach(() => {
    if (originalClientKey === undefined) {
      delete process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
    } else {
      process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY = originalClientKey;
    }
  });

  it('redirects to TikTok and stores the OAuth state + next path in cookies', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(307);
    const location = response.headers.get('location') || '';
    expect(location).toContain('https://www.tiktok.com/v2/auth/authorize/');
    expect(location).toContain('client_key=tiktok-client-key');
    expect(location).toContain('scope=user.info.basic');
    expect(location).toContain(
      'redirect_uri=https%3A%2F%2Fauth.kloel.com%2Fapi%2Fauth%2Fcallback%2Ftiktok',
    );
    expect(location).toContain('state=');
    expect(response.cookies.get('kloel_tiktok_oauth_state')?.value).toBeTruthy();
    expect(response.cookies.get('kloel_tiktok_oauth_next')?.value).toBe('%2Fbilling');
  });

  it('redirects back to login when TikTok client key is missing', async () => {
    delete process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;

    const response = await GET(createRequest('https://auth.kloel.com/api/auth/tiktok/start'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?error=tiktok_auth_failed&reason=client_key_missing',
    );
  });
});
