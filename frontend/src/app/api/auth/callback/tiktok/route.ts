import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { buildAppUrl, buildAuthUrl, sanitizeNextPath } from '@/lib/subdomains';
import { getBackendUrl } from '../../../_lib/backend-url';
import { setSharedAuthCookies } from '../../_lib/shared-auth-cookies';

const STATE_COOKIE = 'kloel_tiktok_oauth_state';
const NEXT_COOKIE = 'kloel_tiktok_oauth_next';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

type TikTokTokenExchangePayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  error?: string;
  error_description?: string;
};

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(NEXT_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

function readNextPath(request: NextRequest): string {
  const rawValue = request.cookies.get(NEXT_COOKIE)?.value || '';
  if (!rawValue) {
    return '/';
  }

  try {
    return sanitizeNextPath(decodeURIComponent(rawValue), '/');
  } catch {
    return '/';
  }
}

function buildErrorRedirect(request: NextRequest, reason: string) {
  const currentHost = request.headers.get('host') || request.nextUrl.host;
  const destination = new URL(buildAuthUrl('/login', currentHost));
  destination.searchParams.set('error', 'tiktok_auth_failed');
  destination.searchParams.set('reason', reason);

  const nextPath = readNextPath(request);
  if (nextPath !== '/') {
    destination.searchParams.set('next', nextPath);
  }

  const response = NextResponse.redirect(destination);
  clearOAuthCookies(response);
  return response;
}

async function exchangeTikTokCode(code: string, redirectUri: string) {
  const clientKey =
    process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY?.trim() ||
    process.env.TIKTOK_CLIENT_KEY?.trim() ||
    '';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim() || '';
  if (!clientKey || !clientSecret) {
    return { ok: false as const, reason: 'client_secret_missing' };
  }

  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const payload = (await response.json().catch(() => ({}))) as TikTokTokenExchangePayload;
    if (!response.ok || !payload.access_token || !payload.open_id || payload.error) {
      return { ok: false as const, reason: 'token_exchange_failed' };
    }

    return {
      ok: true as const,
      payload,
    };
  } catch (error: unknown) {
    const errorName =
      error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    return {
      ok: false as const,
      reason:
        errorName === 'TimeoutError' || errorName === 'AbortError' ? 'timeout' : 'unexpected_error',
    };
  }
}

/** Get. */
export async function GET(request: NextRequest) {
  const oauthError = request.nextUrl.searchParams.get('error')?.trim();
  if (oauthError) {
    return buildErrorRedirect(request, oauthError.toLowerCase());
  }

  const code = request.nextUrl.searchParams.get('code')?.trim() || '';
  if (!code) {
    return buildErrorRedirect(request, 'missing_code');
  }

  const state = request.nextUrl.searchParams.get('state')?.trim() || '';
  const storedState = request.cookies.get(STATE_COOKIE)?.value?.trim() || '';
  if (!state || !storedState || state !== storedState) {
    return buildErrorRedirect(request, 'state_mismatch');
  }

  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return buildErrorRedirect(request, 'backend_not_configured');
  }

  const redirectUri = new URL('/api/auth/callback/tiktok', request.nextUrl.origin).toString();

  try {
    const exchange = await exchangeTikTokCode(code, redirectUri);
    if (!exchange.ok) {
      return buildErrorRedirect(request, exchange.reason);
    }

    const response = await fetch(`${backendUrl}/auth/oauth/tiktok`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify({
        accessToken: exchange.payload.access_token,
        openId: exchange.payload.open_id,
        refreshToken: exchange.payload.refresh_token,
        expiresInSeconds: exchange.payload.expires_in,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      return buildErrorRedirect(request, 'backend_rejected');
    }

    revalidateTag('auth', 'max');
    const currentHost = request.headers.get('host') || request.nextUrl.host;
    const nextPath = readNextPath(request);
    const destination = new URL(buildAppUrl(nextPath, currentHost));
    destination.searchParams.set('auth', '1');

    const successResponse = NextResponse.redirect(destination);
    clearOAuthCookies(successResponse);
    setSharedAuthCookies(request, successResponse, data);
    return successResponse;
  } catch (error: unknown) {
    const errorName =
      error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    return buildErrorRedirect(
      request,
      errorName === 'TimeoutError' || errorName === 'AbortError' ? 'timeout' : 'unexpected_error',
    );
  }
}
