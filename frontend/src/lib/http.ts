// Centralized HTTP helpers to avoid double slashes and missing prefixes
// Uses NEXT_PUBLIC_API_URL in browser, BACKEND_URL in server, defaults to localhost.

const rawBase =
  (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:3001';

// Remove trailing slashes to avoid // when concatenating paths
export const API_BASE = rawBase.replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
