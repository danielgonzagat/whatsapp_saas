const TRAILING_SLASH_RE = /\/+$/;

/**
 * Resolves the backend API base URL on the server side (Next.js server
 * components / metadata). Reads `NEXT_PUBLIC_API_URL` → `BACKEND_URL` →
 * `SERVICE_BASE_URL` and strips trailing slashes. Falls back to
 * `http://localhost:3001` for local dev.
 *
 * Canonical so the public checkout server entry points
 * (`/[slug]/page.tsx` and `/r/[code]/page.tsx`) share the same env
 * precedence and trailing-slash normalization.
 */
export function getServerApiBase(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || process.env.SERVICE_BASE_URL;
  if (envUrl) {
    return envUrl.replace(TRAILING_SLASH_RE, '');
  }
  return 'http://localhost:3001';
}
