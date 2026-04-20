const A_Z_A_Z__A_Z_A_Z_D_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const PATTERN_RE = /^\/+/;
const PATTERN_RE_2 = /\/+$/;
const LOCAL_DEV_BACKEND_URL = 'http://127.0.0.1:3001';

function getDefaultBackendUrl() {
  if (process.env.NODE_ENV === 'production') {
    return '';
  }

  return LOCAL_DEV_BACKEND_URL;
}

function hasProtocol(value: string) {
  return A_Z_A_Z__A_Z_A_Z_D_RE.test(value);
}

function isLocalHostLike(value: string) {
  const candidate = value.trim().replace(PATTERN_RE, '').split('/')[0].split(':')[0].toLowerCase();

  return candidate === 'localhost' || candidate === '127.0.0.1' || candidate === '0.0.0.0';
}

export function normalizeBackendUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return '';
  }

  const normalizedInput = hasProtocol(raw)
    ? raw
    : raw.startsWith('//')
      ? `https:${raw}`
      : `${isLocalHostLike(raw) ? 'http' : 'https'}://${raw.replace(PATTERN_RE, '')}`;

  try {
    return new URL(normalizedInput).toString().replace(PATTERN_RE_2, '');
  } catch {
    return '';
  }
}

export function getBackendUrl() {
  return (
    normalizeBackendUrl(process.env.BACKEND_URL) ||
    normalizeBackendUrl(process.env.NEXT_PUBLIC_API_URL) ||
    normalizeBackendUrl(process.env.NEXT_PUBLIC_SERVICE_BASE_URL) ||
    normalizeBackendUrl(process.env.SERVICE_BASE_URL) ||
    getDefaultBackendUrl()
  ).replace(PATTERN_RE_2, '');
}

export function getBackendCandidateUrls() {
  const bases = [
    normalizeBackendUrl(process.env.BACKEND_URL),
    normalizeBackendUrl(process.env.NEXT_PUBLIC_API_URL),
    normalizeBackendUrl(process.env.NEXT_PUBLIC_SERVICE_BASE_URL),
    normalizeBackendUrl(process.env.SERVICE_BASE_URL),
    getDefaultBackendUrl(),
  ].filter(Boolean);

  const candidates: string[] = [];
  for (const base of [...new Set(bases)]) {
    candidates.push(base);
    if (!base.endsWith('/api')) {
      candidates.push(`${base}/api`);
    }
  }

  return [...new Set(candidates.map((value) => value.replace(PATTERN_RE_2, '')))];
}
