import { describe, expect, it } from 'vitest';

import {
  buildAppleSignInDestination,
  buildPrefillRequestKey,
  buildSocialCapturePrefillQuery,
  canTriggerAppleSignIn,
  canTriggerFacebookSignIn,
  hasUsablePrefillIdentity,
} from './useCheckoutSocialIdentity.helpers';
import type { PrefillResponse } from './useCheckoutSocialIdentity.types';

describe('buildPrefillRequestKey', () => {
  it('joins slug, checkoutCode and fingerprint with colons', () => {
    expect(buildPrefillRequestKey('slug-a', 'code-1', 'fp-123')).toBe('slug-a:code-1:fp-123');
  });

  it('uses an empty segment when checkoutCode is undefined', () => {
    expect(buildPrefillRequestKey('slug-a', undefined, 'fp-123')).toBe('slug-a::fp-123');
  });

  it('uses an empty segment when checkoutCode is an empty string', () => {
    expect(buildPrefillRequestKey('slug-a', '', 'fp-123')).toBe('slug-a::fp-123');
  });

  it('produces a stable key so duplicate effect runs can short-circuit', () => {
    const a = buildPrefillRequestKey('s', 'c', 'fp');
    const b = buildPrefillRequestKey('s', 'c', 'fp');
    expect(a).toBe(b);
  });
});

describe('buildSocialCapturePrefillQuery', () => {
  it('includes slug and deviceFingerprint by default', () => {
    const params = buildSocialCapturePrefillQuery({
      slug: 'plan-a',
      deviceFingerprint: 'fp-xyz',
    });
    expect(params.get('slug')).toBe('plan-a');
    expect(params.get('deviceFingerprint')).toBe('fp-xyz');
    expect(params.has('checkoutCode')).toBe(false);
  });

  it('appends a trimmed checkoutCode when provided', () => {
    const params = buildSocialCapturePrefillQuery({
      slug: 'plan-a',
      deviceFingerprint: 'fp-xyz',
      checkoutCode: '  CODE-7  ',
    });
    expect(params.get('checkoutCode')).toBe('CODE-7');
  });

  it('omits an empty / whitespace-only checkoutCode', () => {
    const params = buildSocialCapturePrefillQuery({
      slug: 'plan-a',
      deviceFingerprint: 'fp-xyz',
      checkoutCode: '   ',
    });
    expect(params.has('checkoutCode')).toBe(false);
  });

  it('omits a null checkoutCode without throwing', () => {
    const params = buildSocialCapturePrefillQuery({
      slug: 'plan-a',
      deviceFingerprint: 'fp-xyz',
      checkoutCode: null,
    });
    expect(params.has('checkoutCode')).toBe(false);
  });
});

describe('buildAppleSignInDestination', () => {
  it('builds an absolute URL pointing at the Apple start route', () => {
    const url = buildAppleSignInDestination({
      origin: 'https://example.test',
      slug: 'slug-1',
      deviceFingerprint: 'fp-1',
      returnPath: '/checkout/slug-1',
      returnSearch: '?utm=a',
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://example.test');
    expect(parsed.pathname).toBe('/api/checkout/social/apple/start');
    expect(parsed.searchParams.get('slug')).toBe('slug-1');
    expect(parsed.searchParams.get('deviceFingerprint')).toBe('fp-1');
    expect(parsed.searchParams.get('returnTo')).toBe('/checkout/slug-1?utm=a');
  });

  it('appends a trimmed checkoutCode when provided', () => {
    const url = buildAppleSignInDestination({
      origin: 'https://example.test',
      slug: 'slug-1',
      deviceFingerprint: 'fp-1',
      returnPath: '/checkout/slug-1',
      returnSearch: '',
      checkoutCode: '  ABC  ',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('checkoutCode')).toBe('ABC');
  });

  it('does not set checkoutCode for an empty/whitespace value', () => {
    const url = buildAppleSignInDestination({
      origin: 'https://example.test',
      slug: 'slug-1',
      deviceFingerprint: 'fp-1',
      returnPath: '/checkout/slug-1',
      returnSearch: '',
      checkoutCode: '   ',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('checkoutCode')).toBe(false);
  });

  it('handles an empty return path/search cleanly', () => {
    const url = buildAppleSignInDestination({
      origin: 'https://example.test',
      slug: 'slug-1',
      deviceFingerprint: 'fp-1',
      returnPath: '',
      returnSearch: '',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('returnTo')).toBe('');
  });
});

describe('hasUsablePrefillIdentity', () => {
  it('returns false for null/undefined payloads', () => {
    expect(hasUsablePrefillIdentity(null)).toBe(false);
    expect(hasUsablePrefillIdentity(undefined)).toBe(false);
  });

  it('returns false when provider is missing', () => {
    const data = {
      leadId: 'lead-1',
      name: 'Alice',
      email: 'a@example.test',
    } as unknown as PrefillResponse;
    expect(hasUsablePrefillIdentity(data)).toBe(false);
  });

  it('returns false when name is missing or empty', () => {
    const data: PrefillResponse = {
      leadId: 'lead-1',
      provider: 'google',
      name: '',
      email: 'a@example.test',
    };
    expect(hasUsablePrefillIdentity(data)).toBe(false);
  });

  it('returns false when email is missing or empty', () => {
    const data: PrefillResponse = {
      leadId: 'lead-1',
      provider: 'google',
      name: 'Alice',
      email: '',
    };
    expect(hasUsablePrefillIdentity(data)).toBe(false);
  });

  it('returns true when provider, name and email are all present', () => {
    const data: PrefillResponse = {
      leadId: 'lead-1',
      provider: 'facebook',
      name: 'Alice',
      email: 'a@example.test',
    };
    expect(hasUsablePrefillIdentity(data)).toBe(true);
  });
});

describe('canTriggerAppleSignIn', () => {
  it('returns true when enabled, appleClientId and slug are present', () => {
    expect(
      canTriggerAppleSignIn({ enabled: true, appleClientId: 'client.id', slug: 'slug-a' }),
    ).toBe(true);
  });

  it('returns false when disabled', () => {
    expect(
      canTriggerAppleSignIn({ enabled: false, appleClientId: 'client.id', slug: 'slug-a' }),
    ).toBe(false);
  });

  it('returns false when appleClientId is empty', () => {
    expect(canTriggerAppleSignIn({ enabled: true, appleClientId: '', slug: 'slug-a' })).toBe(
      false,
    );
  });

  it('returns false when slug is missing', () => {
    expect(
      canTriggerAppleSignIn({ enabled: true, appleClientId: 'client.id', slug: undefined }),
    ).toBe(false);
  });
});

describe('canTriggerFacebookSignIn', () => {
  it('returns true only when every flag is on', () => {
    expect(
      canTriggerFacebookSignIn({
        enabled: true,
        metaAppId: 'meta-app',
        facebookSdkReady: true,
        hasFacebookSdk: true,
      }),
    ).toBe(true);
  });

  it('returns false when SDK is not ready', () => {
    expect(
      canTriggerFacebookSignIn({
        enabled: true,
        metaAppId: 'meta-app',
        facebookSdkReady: false,
        hasFacebookSdk: true,
      }),
    ).toBe(false);
  });

  it('returns false when window.FB has not loaded yet', () => {
    expect(
      canTriggerFacebookSignIn({
        enabled: true,
        metaAppId: 'meta-app',
        facebookSdkReady: true,
        hasFacebookSdk: false,
      }),
    ).toBe(false);
  });

  it('returns false when metaAppId is missing', () => {
    expect(
      canTriggerFacebookSignIn({
        enabled: true,
        metaAppId: '',
        facebookSdkReady: true,
        hasFacebookSdk: true,
      }),
    ).toBe(false);
  });

  it('returns false when disabled by the caller', () => {
    expect(
      canTriggerFacebookSignIn({
        enabled: false,
        metaAppId: 'meta-app',
        facebookSdkReady: true,
        hasFacebookSdk: true,
      }),
    ).toBe(false);
  });
});
