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

/**
 * Detects backend responses that smell like an auth-redirect HTML page rather
 * than the expected JSON payload. Used by api route proxies to short-circuit
 * 200-with-html replies that would otherwise look like success.
 */
export function isAuthRedirectLike(value: string): boolean {
  const normalized = String(value || '').toLowerCase();
  return (
    normalized.includes('auth.kloel.com/login') ||
    normalized.includes('forceauth=1') ||
    normalized.includes('<html') ||
    normalized.includes('<!doctype html')
  );
}

/**
 * Resolves the active workspace id from request headers (preferred) or the
 * `kloel_workspace_id` cookie. Returns `''` when none match — callers decide
 * how to handle the missing-workspace case.
 */
export function resolveWorkspaceHeader(request: NextRequest): string {
  return (
    request.headers.get('x-workspace-id') ||
    request.headers.get('x-kloel-workspace-id') ||
    readCookieValue(request, 'kloel_workspace_id') ||
    ''
  );
}
