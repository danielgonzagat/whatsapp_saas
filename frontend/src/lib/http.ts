const A_Z_A_Z__A_Z_A_Z_D_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const PATTERN_RE = /^\/+/;
const PATTERN_RE_2 = /\/+$/;
// frontend/src/lib/http.ts
// Centralizado para construir URLs da API
//
// Wave 3 P6.5-2 / I19 — API Base URL Must Be Explicit in Production.
//
// The previous implementation silently fell back to window.location.origin
// when NEXT_PUBLIC_API_URL was unset. Frontend is on Vercel and backend is
// on Railway, so the same-origin fallback was guaranteed wrong in
// production — it produced the 401/502 cascade documented in
// FUNCTIONAL_TEST_RESULTS.md (2026-04-02, 52% functional pass rate).
//
// This module now FAILS FAST in production at module-load time when no
// explicit API URL is configured. The dev fallback to localhost:3001 is
// preserved so a hot-reload loop without an .env.local still works on a
// developer machine.

const isBrowser = typeof window !== 'undefined';
const isProductionBuild = process.env.NODE_ENV === 'production';

const hasProtocol = (value: string) => A_Z_A_Z__A_Z_A_Z_D_RE.test(value);

const isLocalHostLike = (value: string) => {
  const candidate = value.trim().replace(PATTERN_RE, '').split('/')[0].split(':')[0].toLowerCase();

  return candidate === 'localhost' || candidate === '127.0.0.1' || candidate === '0.0.0.0';
};

const normalizeApiBase = (value: string | undefined): string => {
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
};

/**
 * DETECÇÃO ROBUSTA DE API URL
 * Ordem de prioridade:
 * 1. NEXT_PUBLIC_API_URL (variável de ambiente - produção)
 * 2. BACKEND_URL (build-time)
 * 3. localhost:3001 (desenvolvimento local)
 * 4. Mesmo origin atual (somente como fallback de emergência)
 *
 * IMPORTANTE:
 * - Em produção, configure NEXT_PUBLIC_API_URL corretamente.
 * - O fallback same-origin só é seguro quando frontend e backend estão
 *   atrás do mesmo domínio/reverse proxy.
 */
const getApiBase = (): string => {
  // 1) Variáveis de ambiente (prioridade máxima)
  const publicApiUrl = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);
  if (publicApiUrl) {
    return publicApiUrl;
  }

  const legacyPublicApiUrl = normalizeApiBase(process.env.NEXT_PUBLIC_SERVICE_BASE_URL);
  if (legacyPublicApiUrl) {
    return legacyPublicApiUrl;
  }

  const backendUrl = normalizeApiBase(process.env.BACKEND_URL);
  if (backendUrl) {
    return backendUrl;
  }

  const serviceBaseUrl = normalizeApiBase(process.env.SERVICE_BASE_URL);
  if (serviceBaseUrl) {
    return serviceBaseUrl;
  }

  // 2) I19 — fail fast in production. This MUST be checked BEFORE the
  //    dev/localhost fallbacks because the semantic is "in a production
  //    build, we demand the env var regardless of runtime hostname". An
  //    attacker who tricks the app into thinking it's on localhost (or
  //    a misconfigured deploy) cannot bypass this gate.
  //
  //    The same-origin fallback was the root cause of the 401/502
  //    cascade in FUNCTIONAL_TEST_RESULTS.md (52% pass rate, 2026-04-02).
  //    Frontend on Vercel + backend on Railway = same-origin is wrong.
  if (isProductionBuild) {
    throw new Error(
      '[http] NEXT_PUBLIC_API_URL is required in production. ' +
        'Set it at build time to your backend base URL (e.g. https://api.kloel.com). ' +
        'See frontend/.env.example and docs/visual-freeze.md for context.',
    );
  }

  // 3) Desenvolvimento local — only reachable in non-production builds.
  if (
    isBrowser &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:3001';
  }

  // 4) DEV-only fallback to same-origin. In dev (NODE_ENV !== 'production'),
  //    we still allow same-origin so a hot-reload loop without .env.local
  //    works on a developer machine. But the warning is loud so the
  //    developer notices.
  if (isBrowser) {
    console.warn(
      '[http] NEXT_PUBLIC_API_URL not set; using same-origin in DEV only. ' +
        'This will fail in production — set the env var before deploying.',
    );
    return normalizeApiBase(window.location.origin);
  }

  return '';
};

// Remove barras ao fim para não gerar // nas URLs
export const API_BASE = getApiBase().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
