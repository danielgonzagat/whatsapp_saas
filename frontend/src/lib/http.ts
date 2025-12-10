// Centralized HTTP helpers to avoid double slashes and missing prefixes
// Uses NEXT_PUBLIC_API_URL in browser, BACKEND_URL in server, defaults to localhost.

// Next.js substitui process.env.NEXT_PUBLIC_* no build time - precisa estar definido no Vercel
const rawBase =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:3001';

// Remove trailing slashes to avoid // when concatenating paths
export const API_BASE = rawBase.replace(/\/+$/, '');

// Debug: log apenas uma vez no client (ajuda a identificar se a variável foi injetada)
if (typeof window !== 'undefined' && !window.__API_BASE_LOGGED__) {
  console.log('[HTTP] API_BASE:', API_BASE);
  (window as any).__API_BASE_LOGGED__ = true;
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
