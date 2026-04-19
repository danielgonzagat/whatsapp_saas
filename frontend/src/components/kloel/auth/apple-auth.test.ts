import { describe, expect, it } from 'vitest';

import { buildAppleAuthorizationUrl } from './apple-auth';

describe('buildAppleAuthorizationUrl', () => {
  it('builds the Apple authorize URL against the shared callback route', () => {
    const url = buildAppleAuthorizationUrl({
      clientId: 'com.kloel.web',
      origin: 'https://auth.kloel.com',
      nextPath: '/billing',
    });

    expect(url.origin).toBe('https://appleid.apple.com');
    expect(url.pathname).toBe('/auth/authorize');
    expect(url.searchParams.get('client_id')).toBe('com.kloel.web');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://auth.kloel.com/api/auth/callback/apple',
    );
    expect(url.searchParams.get('response_type')).toBe('code id_token');
    expect(url.searchParams.get('scope')).toBe('name email');
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.get('state')).toBe('/billing');
  });
});
