import type { NextRequest } from 'next/server';

/**
 * Reads a cookie value by name from a Next.js Edge/Node API request.
 * Returns the raw value or null if the cookie is missing/empty.
 *
 * Canonical helper used by route proxies to forward bearer tokens
 * stored in HttpOnly cookies (kloel_*_token / etc.).
 */
export function readCookieValue(request: NextRequest, name: string): string | null {
  const value = request.cookies.get(name)?.value;
  return value && value.length > 0 ? value : null;
}

/**
 * Tries each cookie name in order; if any resolves to a non-empty value,
 * returns `Bearer <value>`. Otherwise null.
 */
export function firstCookieBearer(
  request: NextRequest,
  cookieNames: string[],
): string | null {
  for (const cookieName of cookieNames) {
    const value = readCookieValue(request, cookieName);
    if (value) {
      return `Bearer ${value}`;
    }
  }
  return null;
}

/**
 * Resolves a Bearer credential from a request:
 *   1. raw `headerName` (e.g. 'authorization') — used as-is, wrapped as `Bearer ...`
 *   2. fallback to {@link firstCookieBearer} over `cookieNames`
 *
 * Returns null when both sources are empty.
 */
export function bearerFromHeaderOrCookie(
  request: NextRequest,
  headerName: string,
  cookieNames: string[],
): string | null {
  const headerValue = request.headers.get(headerName);
  if (headerValue) {
    return `Bearer ${headerValue}`;
  }
  return firstCookieBearer(request, cookieNames);
}
