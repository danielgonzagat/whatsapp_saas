import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getBackendUrl: vi.fn(() => 'https://backend.example.com'),
}));

vi.mock('../../../../_lib/backend-url', () => ({
  getBackendUrl: mocks.getBackendUrl,
}));

import { POST } from './route';

function encodeCookie(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createPostRequest(options?: { state?: string; cookieState?: string }) {
  const form = new FormData();
  form.set('id_token', 'apple-token');
  form.set('code', 'apple-code');
  form.set('state', options?.state || 'state-123');
  form.set(
    'user',
    JSON.stringify({
      email: 'buyer@kloel.com',
      name: { firstName: 'Buyer', lastName: 'Apple' },
    }),
  );

  const cookieState = options?.cookieState || 'state-123';
  return {
    method: 'POST',
    headers: new Headers({ host: 'pay.kloel.com' }),
    nextUrl: new URL('https://pay.kloel.com/api/checkout/social/apple/callback'),
    formData: vi.fn(async () => form),
    cookies: {
      get: vi.fn(() => ({
        value: encodeCookie({
          nonce: cookieState,
          slug: 'checkout-slug',
          checkoutCode: 'CHK123',
          deviceFingerprint: 'device-123',
          returnTo: '/r/CHK123',
          sourceUrl: 'https://pay.kloel.com/r/CHK123',
        }),
      })),
    },
  } as unknown as NextRequest;
}

describe('checkout Apple callback route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getBackendUrl.mockReset();
    mocks.getBackendUrl.mockReturnValue('https://backend.example.com');
  });

  it('captures the Apple identity in the backend and redirects back to checkout', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ leadId: 'lead_1', provider: 'apple' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(createPostRequest());

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://backend.example.com/checkout/public/social-capture',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          slug: 'checkout-slug',
          provider: 'apple',
          identityToken: 'apple-token',
          authorizationCode: 'apple-code',
          redirectUri: 'https://pay.kloel.com/api/checkout/social/apple/callback',
          user: {
            email: 'buyer@kloel.com',
            name: { firstName: 'Buyer', lastName: 'Apple' },
          },
          checkoutCode: 'CHK123',
          deviceFingerprint: 'device-123',
          sourceUrl: 'https://pay.kloel.com/r/CHK123',
          refererUrl: undefined,
        }),
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://pay.kloel.com/r/CHK123?apple_social=1');
  });

  it('rejects callbacks whose state does not match the secure cookie', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await POST(createPostRequest({ state: 'tampered', cookieState: 'state-123' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pay.kloel.com/r/CHK123?apple_social=0&apple_social_error=state_mismatch',
    );
  });
});
