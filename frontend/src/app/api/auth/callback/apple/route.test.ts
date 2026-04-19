import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAppleCheckoutState } from '@/lib/apple-auth-state';

const { mockedSetSharedAuthCookies } = vi.hoisted(() => ({
  mockedSetSharedAuthCookies: vi.fn(),
}));

vi.mock('../../../_lib/backend-url', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}));

vi.mock('../../_lib/shared-auth-cookies', () => ({
  setSharedAuthCookies: mockedSetSharedAuthCookies,
  hasSharedAuthToken: (payload: Record<string, unknown> | null | undefined) =>
    Boolean(payload?.access_token || payload?.accessToken),
}));

import { GET, POST } from './route';

function createPostRequest(options?: {
  body?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}) {
  const formEntries = Object.entries(options?.body || {});
  return {
    headers: new Headers(options?.headers),
    nextUrl: new URL(options?.url || 'https://auth.kloel.com/api/auth/callback/apple'),
    formData: vi.fn(async () => {
      const formData = new FormData();
      for (const [key, value] of formEntries) {
        formData.set(key, value);
      }
      return formData;
    }),
  } as any;
}

function createGetRequest(url: string) {
  return {
    headers: new Headers(),
    nextUrl: new URL(url),
  } as any;
}

describe('apple callback auth route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedSetSharedAuthCookies.mockReset();
  });

  it('posts Apple form_post credentials to the backend, sets cookies, and redirects to the app', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          workspace: { id: 'ws-1' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(
      createPostRequest({
        body: {
          id_token: 'apple-identity-token',
          user: JSON.stringify({
            name: { firstName: 'Ana', lastName: 'Silva' },
            email: 'ana@kloel.com',
          }),
          state: '/billing',
        },
        headers: {
          'x-forwarded-for': '1.1.1.1',
        },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/auth/oauth/apple',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          identityToken: 'apple-identity-token',
          user: {
            name: { firstName: 'Ana', lastName: 'Silva' },
            email: 'ana@kloel.com',
          },
        }),
      }),
    );
    expect(mockedSetSharedAuthCookies).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.kloel.com/billing?auth=1');
  });

  it('captures Apple checkout identity and redirects back to the same checkout when the Apple state targets checkout social capture', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          leadId: 'lead-apple',
          provider: 'apple',
          email: 'ana@kloel.com',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(
      createPostRequest({
        body: {
          id_token: 'apple-identity-token',
          user: JSON.stringify({
            name: { firstName: 'Ana', lastName: 'Silva' },
            email: 'ana@kloel.com',
          }),
          state: encodeAppleCheckoutState({
            flow: 'checkout',
            slug: 'checkout-demo',
            checkoutCode: 'CHK-001',
            deviceFingerprint: 'device-apple',
            returnPath: '/checkout-demo?coupon=VIP',
            sourceUrl: 'https://pay.kloel.com/checkout-demo?coupon=VIP',
            refererUrl: 'https://instagram.com/kloel',
          }),
        },
        url: 'https://pay.kloel.com/api/auth/callback/apple',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/checkout/public/social-capture',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          slug: 'checkout-demo',
          provider: 'apple',
          identityToken: 'apple-identity-token',
          user: {
            name: { firstName: 'Ana', lastName: 'Silva' },
            email: 'ana@kloel.com',
          },
          checkoutCode: 'CHK-001',
          deviceFingerprint: 'device-apple',
          sourceUrl: 'https://pay.kloel.com/checkout-demo?coupon=VIP',
          refererUrl: 'https://instagram.com/kloel',
        }),
      }),
    );
    expect(mockedSetSharedAuthCookies).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://pay.kloel.com/checkout-demo?coupon=VIP');
  });

  it('redirects malformed checkout Apple callbacks back to the same pay surface with a stable error code', async () => {
    const response = await POST(
      createPostRequest({
        body: {
          state: encodeAppleCheckoutState({
            flow: 'checkout',
            slug: 'checkout-demo',
            deviceFingerprint: 'device-apple',
            returnPath: '/checkout-demo?coupon=VIP',
          }),
        },
        url: 'https://pay.kloel.com/api/auth/callback/apple',
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pay.kloel.com/checkout-demo?coupon=VIP&socialAuthError=apple_invalid_response&socialAuthProvider=apple',
    );
  });

  it('redirects Apple callback failures back to auth with a stable error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'invalid apple token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(
      createPostRequest({
        body: {
          id_token: 'bad-token',
        },
        url: 'https://auth.kloel.com/api/auth/callback/apple?next=%2Fbilling',
      }),
    );

    expect(mockedSetSharedAuthCookies).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?forceAuth=1&error=apple_oauth_failed&next=%2Fbilling',
    );
  });

  it('redirects Apple account-link confirmations back to auth with a notice code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'oauth_link_confirmation_required',
          message:
            'Já existe uma conta KLOEL com este email. Enviamos um link para confirmar a vinculação com Apple.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const response = await POST(
      createPostRequest({
        body: {
          id_token: 'apple-token',
          state: '/billing',
        },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?forceAuth=1&error=apple_oauth_confirmation_required&next=%2Fbilling&notice=oauth_link_confirmation_required&provider=apple',
    );
  });

  it('surfaces provider-declared errors on the GET callback path', async () => {
    const response = await GET(
      createGetRequest(
        'https://auth.kloel.com/api/auth/callback/apple?error=user_cancelled_authorize&state=%2Fsettings',
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://auth.kloel.com/login?forceAuth=1&error=apple_user_cancelled&next=%2Fsettings',
    );
  });
});
