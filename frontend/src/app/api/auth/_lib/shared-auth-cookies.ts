import { getSharedCookieDomain } from '@/lib/subdomains';
import type { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const ACCESS_TOKEN_COOKIE = 'kloel_access_token';
const REFRESH_TOKEN_COOKIE = 'kloel_refresh_token';
const WORKSPACE_COOKIE = 'kloel_workspace_id';

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveWorkspaceId(payload: unknown): string | null {
  const payloadRecord = readRecord(payload);
  const workspaceRecord = readRecord(payloadRecord?.workspace);
  const userRecord = readRecord(payloadRecord?.user);
  const workspaces = Array.isArray(payloadRecord?.workspaces) ? payloadRecord.workspaces : [];
  const firstWorkspace = readRecord(workspaces[0]);

  const explicitWorkspace = readString(workspaceRecord?.id);
  if (explicitWorkspace) {
    return explicitWorkspace;
  }

  const userWorkspace = readString(userRecord?.workspaceId);
  if (userWorkspace) {
    return userWorkspace;
  }

  const firstWorkspaceId = readString(firstWorkspace?.id);
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

/** Set shared auth cookies. */
export function setSharedAuthCookies(
  request: NextRequest,
  response: NextResponse,
  payload: unknown,
) {
  const payloadRecord = readRecord(payload);
  const accessToken = payloadRecord?.access_token ?? payloadRecord?.accessToken;
  const refreshToken = payloadRecord?.refresh_token ?? payloadRecord?.refreshToken;
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

/** Clear shared auth cookies. */
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
