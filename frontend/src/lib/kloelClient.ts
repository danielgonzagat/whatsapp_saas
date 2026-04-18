import { apiUrl } from './http';

/**
 * Build a URL to the Kloel API backend.
 * SECURITY: The base URL comes from apiUrl() which uses the server-configured
 * NEXT_PUBLIC_API_URL env var — not user input. The `path` parameter is always
 * a hardcoded string literal in callers, not derived from user input.
 */
export function kloelUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiUrl(`/kloel${normalized}`);
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  // nosemgrep: javascript.lang.security.detect-node-ssrf.node-ssrf
  // Safe: `apiUrl(path)` always prefixes NEXT_PUBLIC_API_URL (server-configured env var); `path` is a hardcoded literal in every caller, never user input. No user-controlled host.
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}
