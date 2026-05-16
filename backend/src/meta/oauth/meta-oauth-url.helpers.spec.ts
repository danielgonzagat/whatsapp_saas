import { resolveOAuthRedirect, resolvePublicBackendBaseUrl } from './meta-oauth-url.helpers';

function envOf(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string') {
      env[k] = v;
    }
  }
  return env;
}

describe('resolveOAuthRedirect', () => {
  it('honors META_OAUTH_REDIRECT_URI verbatim (full URL override)', () => {
    const env = envOf({ META_OAUTH_REDIRECT_URI: 'https://api.kloel.com/meta/auth/callback' });
    const r = resolveOAuthRedirect(env);
    expect(r.source).toBe('META_OAUTH_REDIRECT_URI');
    expect(r.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
    expect(r.isFallback).toBe(false);
  });

  it('honors META_OAUTH_REDIRECT_URI even when BACKEND_URL conflicts', () => {
    const env = envOf({
      META_OAUTH_REDIRECT_URI: 'https://api.kloel.com/meta/auth/callback',
      BACKEND_URL: 'https://wrong.example.com',
    });
    const r = resolveOAuthRedirect(env);
    expect(r.source).toBe('META_OAUTH_REDIRECT_URI');
    expect(r.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
  });

  it('ignores META_OAUTH_REDIRECT_URI when it is not a valid absolute URL', () => {
    const env = envOf({
      META_OAUTH_REDIRECT_URI: 'not-a-url',
      BACKEND_PUBLIC_URL: 'https://api.kloel.com',
    });
    const r = resolveOAuthRedirect(env);
    expect(r.source).toBe('BACKEND_PUBLIC_URL');
    expect(r.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
  });

  it('prefers BACKEND_PUBLIC_URL over BACKEND_URL', () => {
    const env = envOf({
      BACKEND_PUBLIC_URL: 'https://api.kloel.com',
      BACKEND_URL: 'https://other.example.com',
    });
    const r = resolveOAuthRedirect(env);
    expect(r.source).toBe('BACKEND_PUBLIC_URL');
    expect(r.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
  });

  it('uses RAILWAY_PUBLIC_DOMAIN as https URL when no explicit backend URL is set', () => {
    const env = envOf({ RAILWAY_PUBLIC_DOMAIN: 'kloel-backend.up.railway.app' });
    const r = resolveOAuthRedirect(env);
    expect(r.source).toBe('RAILWAY_PUBLIC_DOMAIN');
    expect(r.redirectUri).toBe('https://kloel-backend.up.railway.app/meta/auth/callback');
  });

  it('uses NEXT_PUBLIC_API_URL only when it looks like a backend host', () => {
    const env = envOf({ NEXT_PUBLIC_API_URL: 'https://api.kloel.com' });
    const r = resolveOAuthRedirect(env);
    expect(r.source).toBe('NEXT_PUBLIC_API_URL');
    expect(r.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
  });

  it('refuses to use NEXT_PUBLIC_API_URL when the host looks like a frontend', () => {
    const env = envOf({ NEXT_PUBLIC_API_URL: 'https://app.kloel.com' });
    const r = resolveOAuthRedirect(env);
    expect(r.source).toBe('fallback_localhost');
    expect(r.isFallback).toBe(true);
  });

  it('falls back to http://localhost:3001 and flags isFallback when nothing matches', () => {
    const env = envOf({});
    const r = resolveOAuthRedirect(env);
    expect(r.redirectUri).toBe('http://localhost:3001/meta/auth/callback');
    expect(r.isFallback).toBe(true);
    expect(r.source).toBe('fallback_localhost');
  });

  it('strips trailing slashes from BACKEND_PUBLIC_URL', () => {
    const env = envOf({ BACKEND_PUBLIC_URL: 'https://api.kloel.com/' });
    const r = resolveOAuthRedirect(env);
    expect(r.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
  });

  it('promotes bare host to https when no scheme is present', () => {
    const env = envOf({ BACKEND_PUBLIC_URL: 'api.kloel.com' });
    const r = resolveOAuthRedirect(env);
    expect(r.redirectUri).toBe('https://api.kloel.com/meta/auth/callback');
  });
});

describe('resolvePublicBackendBaseUrl (deprecated alias)', () => {
  it('returns the base URL of the resolved redirect', () => {
    const env = envOf({ BACKEND_PUBLIC_URL: 'https://api.kloel.com' });
    expect(resolvePublicBackendBaseUrl(env)).toBe('https://api.kloel.com');
  });
});
