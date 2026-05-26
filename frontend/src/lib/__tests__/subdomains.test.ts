import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  normalizeAppPath,
  detectKloelHost,
  getSharedCookieDomain,
  buildHostTargetUrl,
  buildMarketingUrl,
  buildAuthUrl,
  buildAppUrl,
  buildPayUrl,
  sanitizeNextPath,
  isAuthPath,
  isMarketingPath,
  isKnownAppPath,
  isStaticOrApiPath,
  isValidCheckoutCode,
  isValidCheckoutEntrySegment,
} from '../subdomains';

// ---------------------------------------------------------------------------
// normalizeAppPath
// ---------------------------------------------------------------------------
describe('normalizeAppPath', () => {
  it('defaults to "/" when called with no argument', () => {
    expect(normalizeAppPath()).toBe('/');
  });

  it('returns "/" for empty string', () => {
    expect(normalizeAppPath('')).toBe('/');
  });

  it('returns "/" for whitespace-only string', () => {
    expect(normalizeAppPath('   ')).toBe('/');
  });

  it('converts "/dashboard" to root', () => {
    expect(normalizeAppPath('/dashboard')).toBe('/');
  });

  it('strips /dashboard prefix before query string', () => {
    expect(normalizeAppPath('/dashboard?foo=bar')).toBe('/?foo=bar');
  });

  it('strips /dashboard prefix before hash', () => {
    expect(normalizeAppPath('/dashboard#section')).toBe('/#section');
  });

  it('strips /dashboard/ from deep path', () => {
    expect(normalizeAppPath('/dashboard/analytics')).toBe('/analytics');
  });

  it('returns "/" when path is exactly /dashboard/', () => {
    expect(normalizeAppPath('/dashboard/')).toBe('/');
  });

  it('passes through a regular app path unchanged', () => {
    expect(normalizeAppPath('/settings')).toBe('/settings');
  });

  it('passes through root unchanged', () => {
    expect(normalizeAppPath('/')).toBe('/');
  });

  it('treats null as default', () => {
    expect(Reflect.apply(normalizeAppPath, undefined, [null])).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// detectKloelHost
// ---------------------------------------------------------------------------
describe('detectKloelHost', () => {
  it('returns "unknown" for empty/undefined host', () => {
    expect(detectKloelHost()).toBe('unknown');
    expect(detectKloelHost('')).toBe('unknown');
    expect(detectKloelHost(null)).toBe('unknown');
  });

  // -- production --
  it('detects marketing on prod root domain', () => {
    expect(detectKloelHost('kloel.com')).toBe('marketing');
  });

  it('detects marketing on www subdomain', () => {
    expect(detectKloelHost('www.kloel.com')).toBe('marketing');
  });

  it('detects auth on prod', () => {
    expect(detectKloelHost('auth.kloel.com')).toBe('auth');
  });

  it('detects app on prod', () => {
    expect(detectKloelHost('app.kloel.com')).toBe('app');
  });

  it('detects pay on prod', () => {
    expect(detectKloelHost('pay.kloel.com')).toBe('pay');
  });

  // -- local --
  it('detects marketing on localhost', () => {
    expect(detectKloelHost('localhost')).toBe('marketing');
  });

  it('detects marketing on 127.0.0.1', () => {
    expect(detectKloelHost('127.0.0.1')).toBe('marketing');
  });

  it('detects marketing on kloel.localhost', () => {
    expect(detectKloelHost('kloel.localhost')).toBe('marketing');
  });

  it('detects auth on auth.localhost', () => {
    expect(detectKloelHost('auth.localhost')).toBe('auth');
  });

  it('detects app on app.localhost', () => {
    expect(detectKloelHost('app.localhost')).toBe('app');
  });

  it('detects pay on pay.localhost', () => {
    expect(detectKloelHost('pay.localhost')).toBe('pay');
  });

  it('returns "unknown" for unrecognised hosts', () => {
    expect(detectKloelHost('example.com')).toBe('unknown');
    expect(detectKloelHost('random.localhost')).toBe('unknown');
  });

  it('strips port before detection', () => {
    expect(detectKloelHost('app.kloel.com:3000')).toBe('app');
    expect(detectKloelHost('localhost:3000')).toBe('marketing');
  });
});

// ---------------------------------------------------------------------------
// getSharedCookieDomain
// ---------------------------------------------------------------------------
describe('getSharedCookieDomain', () => {
  it('returns ".kloel.com" for root prod domain', () => {
    expect(getSharedCookieDomain('kloel.com')).toBe('.kloel.com');
  });

  it('returns ".kloel.com" for prod subdomains', () => {
    expect(getSharedCookieDomain('app.kloel.com')).toBe('.kloel.com');
    expect(getSharedCookieDomain('auth.kloel.com')).toBe('.kloel.com');
    expect(getSharedCookieDomain('pay.kloel.com')).toBe('.kloel.com');
  });

  it('returns ".root.localhost" for nested localhost subdomains', () => {
    expect(getSharedCookieDomain('app.root.localhost')).toBe('.root.localhost');
  });

  it('returns undefined for plain localhost', () => {
    expect(getSharedCookieDomain('localhost')).toBeUndefined();
  });

  it('returns undefined for unknown hosts', () => {
    expect(getSharedCookieDomain('example.com')).toBeUndefined();
  });

  it('returns undefined for empty/undefined host', () => {
    expect(getSharedCookieDomain()).toBeUndefined();
    expect(getSharedCookieDomain('')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildHostTargetUrl / buildMarketingUrl / buildAuthUrl / buildAppUrl / buildPayUrl
// ---------------------------------------------------------------------------
describe('URL builders', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_AUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN;
  });

  afterEach(() => {
    Object.assign(process.env, ORIGINAL_ENV);
  });

  describe('buildHostTargetUrl', () => {
    it('defaults to prod https when no env and no localhost', () => {
      const url = buildHostTargetUrl('marketing', '/', 'example.com');
      expect(url).toBe('https://kloel.com/');
    });

    it('uses prod subdomain for non-marketing targets', () => {
      expect(buildHostTargetUrl('pay', '/checkout', 'example.com')).toBe(
        'https://pay.kloel.com/checkout',
      );
    });

    it('uses localhost http for local dev', () => {
      const url = buildHostTargetUrl('marketing', '/', 'localhost:3000');
      expect(url).toBe('http://localhost:3000/');
    });

    it('uses auth.localhost for auth target on local dev', () => {
      const url = buildHostTargetUrl('auth', '/login', 'localhost:3000');
      expect(url).toBe('http://auth.localhost:3000/login');
    });

    it('uses env override for auth when NEXT_PUBLIC_AUTH_URL is set', () => {
      process.env.NEXT_PUBLIC_AUTH_URL = 'https://auth.example.com';
      const url = buildHostTargetUrl('auth', '/login', 'localhost:3000');
      expect(url).toBe('https://auth.example.com/login');
    });

    it('uses env override for marketing when set', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://www.example.com';
      const url = buildHostTargetUrl('marketing', '/terms', 'example.com');
      expect(url).toBe('https://www.example.com/terms');
    });

    it('strips trailing slash from env origin', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://www.example.com/';
      const url = buildHostTargetUrl('marketing', '/', 'example.com');
      expect(url).toBe('https://www.example.com/');
    });

    it('handles missing currentHost', () => {
      const url = buildHostTargetUrl('marketing', '/');
      expect(url).toBe('https://kloel.com/');
    });
  });

  describe('buildMarketingUrl', () => {
    it('delegates to buildHostTargetUrl with marketing target', () => {
      const url = buildMarketingUrl('/terms', 'kloel.com');
      expect(url).toBe('https://kloel.com/terms');
    });
  });

  describe('buildAuthUrl', () => {
    it('delegates to buildHostTargetUrl with auth target and /login default', () => {
      const url = buildAuthUrl(undefined, 'kloel.com');
      expect(url).toBe('https://auth.kloel.com/login');
    });
  });

  describe('buildAppUrl', () => {
    it('normalizes /dashboard to root before building', () => {
      const url = buildAppUrl('/dashboard', 'app.kloel.com');
      expect(url).toBe('https://app.kloel.com/');
    });

    it('normalizes /dashboard/analytics', () => {
      const url = buildAppUrl('/dashboard/analytics', 'app.kloel.com');
      expect(url).toBe('https://app.kloel.com/analytics');
    });
  });

  describe('buildPayUrl', () => {
    it('delegates to buildHostTargetUrl with pay target', () => {
      process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN = 'https://pay.example.com';
      const url = buildPayUrl('/checkout', 'kloel.com');
      expect(url).toBe('https://pay.example.com/checkout');
    });
  });
});

// ---------------------------------------------------------------------------
// sanitizeNextPath
// ---------------------------------------------------------------------------
describe('sanitizeNextPath', () => {
  it('returns fallback when path is not absolute', () => {
    expect(sanitizeNextPath('dashboard')).toBe('/');
    expect(sanitizeNextPath('')).toBe('/');
  });

  it('returns fallback when path starts with double slash', () => {
    expect(sanitizeNextPath('//evil')).toBe('/');
  });

  it('returns fallback for auth paths', () => {
    expect(sanitizeNextPath('/login')).toBe('/');
    expect(sanitizeNextPath('/register')).toBe('/');
    expect(sanitizeNextPath('/onboarding')).toBe('/');
  });

  it('normalizes /dashboard to root', () => {
    expect(sanitizeNextPath('/dashboard')).toBe('/');
  });

  it('normalizes /dashboard/deep to /deep', () => {
    expect(sanitizeNextPath('/dashboard/settings')).toBe('/settings');
  });

  it('passes through valid app paths', () => {
    expect(sanitizeNextPath('/settings')).toBe('/settings');
  });

  it('uses custom fallback', () => {
    expect(sanitizeNextPath('invalid', '/fallback')).toBe('/fallback');
  });
});

// ---------------------------------------------------------------------------
// isAuthPath
// ---------------------------------------------------------------------------
describe('isAuthPath', () => {
  it('matches exact auth path', () => {
    expect(isAuthPath('/login')).toBe(true);
    expect(isAuthPath('/register')).toBe(true);
    expect(isAuthPath('/magic-link')).toBe(true);
    expect(isAuthPath('/reset-password')).toBe(true);
    expect(isAuthPath('/verify-email')).toBe(true);
    expect(isAuthPath('/onboarding')).toBe(true);
    expect(isAuthPath('/onboarding-chat')).toBe(true);
    expect(isAuthPath('/auth/apple/callback')).toBe(true);
    expect(isAuthPath('/auth/tiktok/callback')).toBe(true);
  });

  it('matches auth path with trailing sub-path', () => {
    expect(isAuthPath('/login/confirm')).toBe(true);
    expect(isAuthPath('/onboarding/step-2')).toBe(true);
  });

  it('matches auth path with query string', () => {
    expect(isAuthPath('/login?redirect=/dashboard')).toBe(true);
    expect(isAuthPath('/onboarding?step=1')).toBe(true);
  });

  it('does not match non-auth paths', () => {
    expect(isAuthPath('/dashboard')).toBe(false);
    expect(isAuthPath('/settings')).toBe(false);
    expect(isAuthPath('/terms')).toBe(false);
  });

  it('matches root when "/" is the path (special case in prefix list)', () => {
    // "/" is NOT in AUTH_PATH_PREFIXES
    expect(isAuthPath('/')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMarketingPath
// ---------------------------------------------------------------------------
describe('isMarketingPath', () => {
  it('matches root', () => {
    expect(isMarketingPath('/')).toBe(true);
  });

  it('matches exact marketing paths', () => {
    expect(isMarketingPath('/terms')).toBe(true);
    expect(isMarketingPath('/privacy')).toBe(true);
    expect(isMarketingPath('/data-deletion')).toBe(true);
    expect(isMarketingPath('/cookies')).toBe(true);
  });

  it('matches marketing path with query string', () => {
    expect(isMarketingPath('/terms?lang=en')).toBe(true);
  });

  it('matches marketing path with trailing sub-path', () => {
    expect(isMarketingPath('/terms/subsection')).toBe(true);
  });

  it('excludes app paths', () => {
    expect(isMarketingPath('/dashboard')).toBe(false);
    expect(isMarketingPath('/settings')).toBe(false);
  });

  it('excludes auth paths', () => {
    expect(isMarketingPath('/login')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isKnownAppPath
// ---------------------------------------------------------------------------
describe('isKnownAppPath', () => {
  it('matches exact app paths', () => {
    expect(isKnownAppPath('/dashboard')).toBe(true);
    expect(isKnownAppPath('/settings')).toBe(true);
    expect(isKnownAppPath('/analytics')).toBe(true);
    expect(isKnownAppPath('/inbox')).toBe(true);
    expect(isKnownAppPath('/whatsapp')).toBe(true);
  });

  it('matches app paths with trailing sub-path', () => {
    expect(isKnownAppPath('/dashboard/analytics')).toBe(true);
    expect(isKnownAppPath('/settings/profile')).toBe(true);
  });

  it('does not match non-app paths', () => {
    expect(isKnownAppPath('/unknown-page')).toBe(false);
  });

  it('does not match auth paths', () => {
    expect(isKnownAppPath('/login')).toBe(false);
  });

  it('does not match marketing paths', () => {
    expect(isKnownAppPath('/terms')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStaticOrApiPath
// ---------------------------------------------------------------------------
describe('isStaticOrApiPath', () => {
  it('matches exact static paths', () => {
    expect(isStaticOrApiPath('/favicon.ico')).toBe(true);
    expect(isStaticOrApiPath('/robots.txt')).toBe(true);
    expect(isStaticOrApiPath('/sitemap.xml')).toBe(true);
  });

  it('matches Next.js prefix paths', () => {
    expect(isStaticOrApiPath('/_next/static/chunk.js')).toBe(true);
  });

  it('matches API prefix paths', () => {
    expect(isStaticOrApiPath('/api/health')).toBe(true);
  });

  it('matches e2e prefix paths', () => {
    expect(isStaticOrApiPath('/e2e/reset')).toBe(true);
  });

  it('matches icon prefix paths', () => {
    expect(isStaticOrApiPath('/icon/apple-touch-icon.png')).toBe(true);
  });

  it('matches static file extensions', () => {
    expect(isStaticOrApiPath('/images/logo.svg')).toBe(true);
    expect(isStaticOrApiPath('/styles/main.css')).toBe(true);
    expect(isStaticOrApiPath('/scripts/app.js')).toBe(true);
    expect(isStaticOrApiPath('/fonts/roboto.woff2')).toBe(true);
    expect(isStaticOrApiPath('/images/photo.png')).toBe(true);
    expect(isStaticOrApiPath('/images/photo.jpg')).toBe(true);
    expect(isStaticOrApiPath('/images/photo.webp')).toBe(true);
    expect(isStaticOrApiPath('/images/photo.gif')).toBe(true);
    expect(isStaticOrApiPath('/font.woff')).toBe(true);
    expect(isStaticOrApiPath('/font.ttf')).toBe(true);
    expect(isStaticOrApiPath('/data.json')).toBe(false);
    // .map is in the pattern
    expect(isStaticOrApiPath('/bundle.js.map')).toBe(true);
    // .txt is in the pattern
    expect(isStaticOrApiPath('/readme.txt')).toBe(true);
    // .xml is in the pattern
    expect(isStaticOrApiPath('/config.xml')).toBe(true);
  });

  it('does not match regular app pages', () => {
    expect(isStaticOrApiPath('/dashboard')).toBe(false);
    expect(isStaticOrApiPath('/settings')).toBe(false);
    expect(isStaticOrApiPath('/login')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidCheckoutCode
// ---------------------------------------------------------------------------
describe('isValidCheckoutCode', () => {
  it('accepts valid 8-char alphanumeric codes', () => {
    expect(isValidCheckoutCode('MPX9Q2Z7')).toBe(true);
    expect(isValidCheckoutCode('ABCDEFGH')).toBe(true);
    expect(isValidCheckoutCode('12345678')).toBe(true);
  });

  it('rejects codes with wrong length', () => {
    expect(isValidCheckoutCode('MPX9Q2Z')).toBe(false);
    expect(isValidCheckoutCode('MPX9Q2Z7X')).toBe(false);
    expect(isValidCheckoutCode('')).toBe(false);
  });

  it('rejects codes with special characters', () => {
    expect(isValidCheckoutCode('MPX9-Q2Z')).toBe(false);
    expect(isValidCheckoutCode('MPX9 Q2Z')).toBe(false);
  });

  it('accepts lowercase codes (regex includes a-z)', () => {
    expect(isValidCheckoutCode('mpx9q2z7')).toBe(true);
  });

  it('accepts mixed case codes', () => {
    expect(isValidCheckoutCode('AbCdEf12')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidCheckoutEntrySegment
// ---------------------------------------------------------------------------
describe('isValidCheckoutEntrySegment', () => {
  it('accepts valid 8-char codes', () => {
    expect(isValidCheckoutEntrySegment('MPX9Q2Z7')).toBe(true);
  });

  it('accepts legacy slugs with hyphens and underscores', () => {
    expect(isValidCheckoutEntrySegment('pdrn-coreamy-1-frasco-coreamy-pdrn-mngndimj')).toBe(true);
    expect(isValidCheckoutEntrySegment('cmngndimq0004onpob5pkbli3')).toBe(true);
    expect(isValidCheckoutEntrySegment('my-product_v2')).toBe(true);
  });

  it('accepts numeric-only segments', () => {
    expect(isValidCheckoutEntrySegment('12345')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidCheckoutEntrySegment('')).toBe(false);
  });

  it('rejects strings containing dots', () => {
    expect(isValidCheckoutEntrySegment('checkout.html')).toBe(false);
    expect(isValidCheckoutEntrySegment('../checkout')).toBe(false);
    expect(isValidCheckoutEntrySegment('example.com')).toBe(false);
  });

  it('rejects strings containing slashes', () => {
    expect(isValidCheckoutEntrySegment('/checkout')).toBe(false);
    expect(isValidCheckoutEntrySegment('path/segment')).toBe(false);
  });

  it('rejects strings with spaces', () => {
    expect(isValidCheckoutEntrySegment('my checkout')).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(Reflect.apply(isValidCheckoutEntrySegment, undefined, [null])).toBe(false);
    expect(Reflect.apply(isValidCheckoutEntrySegment, undefined, [undefined])).toBe(false);
  });

  it('trims whitespace before validation', () => {
    expect(isValidCheckoutEntrySegment('  MPX9Q2Z7  ')).toBe(true);
  });

  it('rejects too-long segments (over 128 chars)', () => {
    const long = 'A'.repeat(129);
    expect(isValidCheckoutEntrySegment(long)).toBe(false);
  });

  it('accepts segment at max allowed length (128 chars)', () => {
    const max = 'A'.repeat(128);
    expect(isValidCheckoutEntrySegment(max)).toBe(true);
  });

  it('rejects segment starting with invalid character', () => {
    // Must start with [A-Za-z0-9]
    expect(isValidCheckoutEntrySegment('-startswithdash')).toBe(false);
    expect(isValidCheckoutEntrySegment('_startsWithUnderscore')).toBe(false);
  });
});
