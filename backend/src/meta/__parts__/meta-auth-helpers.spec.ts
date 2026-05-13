import { buildDiagnosticsPayload, humanizeMetaError, sanitizeReturnTo } from './meta-auth-helpers';
import type { ResolvedOAuthRedirect } from './meta-oauth-url.helpers';

const FRONTEND = 'https://app.kloel.com';

describe('sanitizeReturnTo', () => {
  it('returns the path when it is a safe internal path', () => {
    expect(sanitizeReturnTo('/marketing/whatsapp', 'whatsapp', FRONTEND)).toBe(
      '/marketing/whatsapp',
    );
  });

  it('preserves query string and hash for safe paths', () => {
    expect(sanitizeReturnTo('/inbox?tab=open#42', 'whatsapp', FRONTEND)).toBe('/inbox?tab=open#42');
  });

  it('rejects protocol-relative URLs that would redirect off-site', () => {
    expect(sanitizeReturnTo('//evil.example.com/path', 'whatsapp', FRONTEND)).toBe(
      '/marketing/whatsapp',
    );
  });

  it('rejects backslash tricks that some browsers normalize to forward slashes', () => {
    expect(sanitizeReturnTo('/\\evil.example.com', 'instagram', FRONTEND)).toBe(
      '/marketing/instagram',
    );
  });

  it('rejects URL-encoded slash/backslash tricks', () => {
    expect(sanitizeReturnTo('/%2fevil.example.com', 'facebook', FRONTEND)).toBe(
      '/marketing/facebook',
    );
    expect(sanitizeReturnTo('/%5cevil.example.com', 'facebook', FRONTEND)).toBe(
      '/marketing/facebook',
    );
  });

  it('rejects absolute URLs with non-http schemes', () => {
    expect(sanitizeReturnTo('javascript:alert(1)', 'whatsapp', FRONTEND)).toBe(
      '/marketing/whatsapp',
    );
    expect(sanitizeReturnTo('data:text/html,', null, FRONTEND)).toBe('/settings?section=apps');
  });

  it('rejects CRLF injection in returnTo', () => {
    expect(sanitizeReturnTo('/ok\r\nSet-Cookie: bad', 'whatsapp', FRONTEND)).toBe(
      '/marketing/whatsapp',
    );
  });

  it('falls back to channel default when returnTo is empty', () => {
    expect(sanitizeReturnTo('', 'instagram', FRONTEND)).toBe('/marketing/instagram');
    expect(sanitizeReturnTo(null, 'facebook', FRONTEND)).toBe('/marketing/facebook');
  });

  it('falls back to /settings?section=apps when channel is unknown', () => {
    expect(sanitizeReturnTo(null, 'tiktok', FRONTEND)).toBe('/settings?section=apps');
    expect(sanitizeReturnTo(null, null, FRONTEND)).toBe('/settings?section=apps');
  });
});

describe('humanizeMetaError', () => {
  it('maps Graph API error code 190 to token expired/revoked message', () => {
    const out = humanizeMetaError('Session has expired', 190);
    expect(out.toLowerCase()).toContain('token');
  });

  it('maps Graph API error code 200 to permission message', () => {
    const out = humanizeMetaError('Permissions error', 200);
    expect(out.toLowerCase()).toContain('permiss');
  });

  it('maps the "URL not in app domains" Meta error to the dedicated message', () => {
    const out = humanizeMetaError(
      "The URL's domain (api.kloel.com) is not included in the app's domains",
      100,
    );
    expect(out.toLowerCase()).toContain('redirect_uri');
  });

  it('maps rate-limit codes 4/17/32/613', () => {
    for (const code of [4, 17, 32, 613]) {
      const out = humanizeMetaError('Anything', code);
      expect(out.toLowerCase()).toContain('limite');
    }
  });

  it('maps code 368 to action-blocked message', () => {
    const out = humanizeMetaError('Action temporarily blocked', 368);
    expect(out.toLowerCase()).toContain('bloque');
  });

  it('maps code 80004 to WhatsApp tier limit message', () => {
    const out = humanizeMetaError('Messaging limit', 80004);
    expect(out.toLowerCase()).toContain('whatsapp');
  });

  it('detects "no business" prose message', () => {
    const out = humanizeMetaError('User is not associated with a verified business', undefined);
    expect(out.toLowerCase()).toContain('business manager');
  });

  it('falls back to a generic message when nothing matches', () => {
    const out = humanizeMetaError('Internal error', null);
    expect(out.length).toBeGreaterThan(0);
  });
});

function good(): ResolvedOAuthRedirect {
  return {
    redirectUri: 'https://api.kloel.com/meta/auth/callback',
    source: 'BACKEND_PUBLIC_URL',
    baseUrl: 'https://api.kloel.com',
    isFallback: false,
  };
}

function fallback(): ResolvedOAuthRedirect {
  return {
    redirectUri: 'http://localhost:3001/meta/auth/callback',
    source: 'fallback_localhost',
    baseUrl: 'http://localhost:3001',
    isFallback: true,
  };
}

describe('buildDiagnosticsPayload', () => {
  it('exposes redirect URI, masked appId, and per-channel scopes', () => {
    const payload = buildDiagnosticsPayload({
      env: {
        META_APP_ID: '1234567890',
        META_APP_SECRET: 'secret',
        META_VERIFY_TOKEN: 'verify',
        META_GRAPH_API_VERSION: 'v21.0',
      },
      resolved: good(),
      frontendUrl: FRONTEND,
      scopesByChannel: {
        whatsapp: ['pages_show_list', 'whatsapp_business_messaging'],
        instagram: ['pages_show_list', 'instagram_basic'],
        facebook: ['pages_show_list', 'pages_messaging'],
      },
    });
    expect(payload.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
    expect(payload.redirectUriSource).toBe('BACKEND_PUBLIC_URL');
    expect(payload.isFallback).toBe(false);
    expect(payload.appId).toBe('1234…7890');
    expect(payload.appIdSet).toBe(true);
    expect(payload.appSecretSet).toBe(true);
    expect(payload.verifyTokenSet).toBe(true);
    expect(payload.graphApiVersion).toBe('v21.0');
    expect(payload.scopes.whatsapp.length).toBeGreaterThan(0);
    expect(payload.scopes.instagram.length).toBeGreaterThan(0);
    expect(payload.scopes.facebook.length).toBeGreaterThan(0);
    expect(payload.checklist.appCredentialsPresent).toBe(true);
    expect(payload.checklist.backendUrlResolved).toBe(true);
    expect(payload.checklist.webhookVerifyTokenPresent).toBe(true);
  });

  it('does not leak the App Secret value', () => {
    const payload = buildDiagnosticsPayload({
      env: {
        META_APP_ID: '12345',
        META_APP_SECRET: 'super-secret-do-not-leak',
      },
      resolved: good(),
      frontendUrl: FRONTEND,
      scopesByChannel: { whatsapp: [], instagram: [], facebook: [] },
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('super-secret-do-not-leak');
  });

  it('flags fallback redirect URI in checklist', () => {
    const payload = buildDiagnosticsPayload({
      env: { META_APP_ID: 'app', META_APP_SECRET: 'sec' },
      resolved: fallback(),
      frontendUrl: FRONTEND,
      scopesByChannel: { whatsapp: [], instagram: [], facebook: [] },
    });
    expect(payload.isFallback).toBe(true);
    expect(payload.checklist.backendUrlResolved).toBe(false);
  });

  it('returns appId=null when META_APP_ID is empty', () => {
    const payload = buildDiagnosticsPayload({
      env: {},
      resolved: fallback(),
      frontendUrl: FRONTEND,
      scopesByChannel: { whatsapp: [], instagram: [], facebook: [] },
    });
    expect(payload.appId).toBeNull();
    expect(payload.appIdSet).toBe(false);
    expect(payload.checklist.appCredentialsPresent).toBe(false);
  });
});
