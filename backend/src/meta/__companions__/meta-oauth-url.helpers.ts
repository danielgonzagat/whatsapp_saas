import { readText } from './meta-read-helpers';

const TRAILING_SLASH_RE = /\/+$/;
const ABSOLUTE_URL_RE = /^https?:\/\//i;
const LOCALHOST_HOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;

function looksLikeBackendUrl(candidate: string): boolean {
  try {
    const { hostname } = new URL(candidate);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('api.') ||
      hostname.startsWith('backend.') ||
      hostname.endsWith('.up.railway.app') ||
      hostname.endsWith('.railway.app')
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

export function resolvePublicBackendBaseUrl(env: NodeJS.ProcessEnv): string {
  const explicitBackendCandidates = [
    env.BACKEND_PUBLIC_URL,
    env.PUBLIC_BACKEND_URL,
    env.BACKEND_URL,
    env.SERVICE_BASE_URL,
    env.API_URL,
    env.API_PUBLIC_URL,
    env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '',
  ];

  for (const candidate of explicitBackendCandidates) {
    const normalized = normalizePublicBaseUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const legacyCandidates = [env.NEXT_PUBLIC_API_URL, env.APP_URL];
  for (const candidate of legacyCandidates) {
    const normalized = normalizePublicBaseUrl(candidate);
    if (normalized && looksLikeBackendUrl(normalized)) {
      return normalized;
    }
  }

  return 'http://localhost:3001';
}
