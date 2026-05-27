import { readText } from '../read-model/meta-read-helpers';
import { TRAILING_SLASH_RE } from '../../common/regex';

const ABSOLUTE_URL_RE = /^https?:\/\//i;
const LOCALHOST_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

function looksLikeBackendUrl(candidate: string): boolean {
  try {
    const { hostname } = new URL(candidate);
    const firstLabel = hostname.split('.')[0];
    const isRailwayHost = hostname.endsWith('.up.railway.app') || hostname.endsWith('.railway.app');
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('api.') ||
      hostname.startsWith('backend.') ||
      (isRailwayHost && (firstLabel === 'api' || firstLabel === 'backend'))
    );
  } catch {
    return false;
  }
}

function normalizePublicBaseUrl(candidate: unknown): string {
  const raw = readText(candidate).trim().replace(TRAILING_SLASH_RE, '');
  if (!raw) {
    return '';
  }

  if (ABSOLUTE_URL_RE.test(raw)) {
    return raw;
  }

  if (LOCALHOST_HOST_RE.test(raw)) {
    return `http://${raw}`;
  }

  return `https://${raw}`;
}

export interface ResolvedOAuthRedirect {
  redirectUri: string;
  source:
    | 'META_OAUTH_REDIRECT_URI'
    | 'BACKEND_PUBLIC_URL'
    | 'PUBLIC_BACKEND_URL'
    | 'BACKEND_URL'
    | 'SERVICE_BASE_URL'
    | 'API_URL'
    | 'API_PUBLIC_URL'
    | 'RAILWAY_PUBLIC_DOMAIN'
    | 'NEXT_PUBLIC_API_URL'
    | 'APP_URL'
    | 'fallback_localhost';
  baseUrl: string;
  isFallback: boolean;
}

const BACKEND_SOURCES: Array<{
  env: keyof NodeJS.ProcessEnv;
  source: ResolvedOAuthRedirect['source'];
  transform?: (raw: string) => string;
}> = [
  { env: 'BACKEND_PUBLIC_URL', source: 'BACKEND_PUBLIC_URL' },
  { env: 'PUBLIC_BACKEND_URL', source: 'PUBLIC_BACKEND_URL' },
  { env: 'BACKEND_URL', source: 'BACKEND_URL' },
  { env: 'SERVICE_BASE_URL', source: 'SERVICE_BASE_URL' },
  { env: 'API_URL', source: 'API_URL' },
  { env: 'API_PUBLIC_URL', source: 'API_PUBLIC_URL' },
  {
    env: 'RAILWAY_PUBLIC_DOMAIN',
    source: 'RAILWAY_PUBLIC_DOMAIN',
    transform: (raw) => (raw ? `https://${raw}` : ''),
  },
];

const LEGACY_SOURCES: Array<{
  env: keyof NodeJS.ProcessEnv;
  source: ResolvedOAuthRedirect['source'];
}> = [
  { env: 'NEXT_PUBLIC_API_URL', source: 'NEXT_PUBLIC_API_URL' },
  { env: 'APP_URL', source: 'APP_URL' },
];

/**
 * Resolve the OAuth redirect URI that will be sent to Meta.
 *
 * Resolution order (first non-empty wins):
 *   1. META_OAUTH_REDIRECT_URI  — full URL override; matches exactly what is
 *      registered as "Valid OAuth Redirect URI" in the Meta Developer Console.
 *      This is the recommended way to pin the redirect, because it decouples
 *      what Meta sees from heuristics over BACKEND_URL.
 *   2. BACKEND_PUBLIC_URL / PUBLIC_BACKEND_URL / BACKEND_URL / SERVICE_BASE_URL
 *      / API_URL / API_PUBLIC_URL / RAILWAY_PUBLIC_DOMAIN
 *   3. Legacy NEXT_PUBLIC_API_URL / APP_URL only when the host already looks
 *      like a backend (api.*, backend.*, *.railway.app).
 *   4. http://localhost:3001 (development fallback only; will never match the
 *      production Meta app and is reported with source=fallback_localhost so
 *      callers can warn loudly).
 *
 * `path` defaults to `/meta/auth/callback`. When an explicit
 * META_OAUTH_REDIRECT_URI is set, its existing path is preserved.
 */
export function resolveOAuthRedirect(
  env: NodeJS.ProcessEnv,
  path = '/meta/auth/callback',
): ResolvedOAuthRedirect {
  const explicit = readText(env.META_OAUTH_REDIRECT_URI).trim();
  if (explicit && ABSOLUTE_URL_RE.test(explicit)) {
    try {
      const url = new URL(explicit);
      const baseUrl =
        `${url.origin}${url.pathname.replace(TRAILING_SLASH_RE, '')}`
          .replace(new RegExp(`${escapeForRegex(path)}$`), '')
          .replace(TRAILING_SLASH_RE, '') || url.origin;
      return {
        redirectUri: url.toString().replace(TRAILING_SLASH_RE, ''),
        source: 'META_OAUTH_REDIRECT_URI',
        baseUrl,
        isFallback: false,
      };
    } catch {
      // fall through to env-derived resolution
    }
  }

  for (const { env: envKey, source, transform } of BACKEND_SOURCES) {
    const rawValue = readText(env[envKey]);
    const candidate = transform ? transform(rawValue.trim()) : rawValue;
    const normalized = normalizePublicBaseUrl(candidate);
    if (normalized) {
      return {
        redirectUri: `${normalized}${path}`,
        source,
        baseUrl: normalized,
        isFallback: false,
      };
    }
  }

  for (const { env: envKey, source } of LEGACY_SOURCES) {
    const normalized = normalizePublicBaseUrl(env[envKey]);
    if (normalized && looksLikeBackendUrl(normalized)) {
      return {
        redirectUri: `${normalized}${path}`,
        source,
        baseUrl: normalized,
        isFallback: false,
      };
    }
  }

  const fallback = 'http://localhost:3001';
  return {
    redirectUri: `${fallback}${path}`,
    source: 'fallback_localhost',
    baseUrl: fallback,
    isFallback: true,
  };
}

/**
 * Back-compat: return only the base URL (without callback path) for callers
 * that need to build other paths (e.g. webhook subscription).
 *
 * @deprecated prefer resolveOAuthRedirect for new code.
 */
export function resolvePublicBackendBaseUrl(env: NodeJS.ProcessEnv): string {
  return resolveOAuthRedirect(env).baseUrl;
}

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
