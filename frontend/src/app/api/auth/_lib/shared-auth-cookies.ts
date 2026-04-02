import type { NextRequest, NextResponse } from 'next/server';
import { getSharedCookieDomain } from '@/lib/subdomains';

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const ACCESS_TOKEN_COOKIE = 'kloel_access_token';
const REFRESH_TOKEN_COOKIE = 'kloel_refresh_token';
const WORKSPACE_COOKIE = 'kloel_workspace_id';

function resolveWorkspaceId(payload: any): string | null {
  const explicitWorkspace = String(payload?.workspace?.id || '').trim();
  if (explicitWorkspace) return explicitWorkspace;

  const userWorkspace = String(payload?.user?.workspaceId || '').trim();
  if (userWorkspace) return userWorkspace;

  const firstWorkspace = payload?.workspaces?.[0];
  const firstWorkspaceId = String(firstWorkspace?.id || '').trim();
  return firstWorkspaceId || null;
}

function cookieOptions(request: NextRequest) {
  const domain = getSharedCookieDomain(request.headers.get('host') || request.nextUrl.host);
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

export function setSharedAuthCookies(request: NextRequest, response: NextResponse, payload: any) {
  const accessToken = payload?.access_token || payload?.accessToken;
  const refreshToken = payload?.refresh_token || payload?.refreshToken;
  const workspaceId = resolveWorkspaceId(payload);
  const options = cookieOptions(request);

  if (!accessToken) {
    return response;
  }

  response.cookies.set('kloel_auth', '1', {
    ...options,
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  response.cookies.set(ACCESS_TOKEN_COOKIE, String(accessToken), {
    ...options,
    maxAge: AUTH_COOKIE_MAX_AGE,
  });

  if (refreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, String(refreshToken), {
      ...options,
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
  }

  if (workspaceId) {
    response.cookies.set(WORKSPACE_COOKIE, workspaceId, {
      ...options,
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export function clearSharedAuthCookies(request: NextRequest, response: NextResponse) {
  const options = cookieOptions(request);

  for (const name of [
    'kloel_auth',
    'kloel_token',
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    WORKSPACE_COOKIE,
  ]) {
    response.cookies.set(name, '', {
      ...options,
      maxAge: 0,
    });
  }

  return response;
}
