import { randomBytes } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { buildAuthUrl, sanitizeNextPath } from '@/lib/subdomains';

const STATE_COOKIE = 'kloel_tiktok_oauth_state';
const NEXT_COOKIE = 'kloel_tiktok_oauth_next';

function setOAuthCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
}

function buildErrorRedirect(request: NextRequest, reason: string) {
  const currentHost = request.headers.get('host') || request.nextUrl.host;
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get('next'), '/');
  const destination = new URL(buildAuthUrl('/login', currentHost));
  destination.searchParams.set('error', 'tiktok_auth_failed');
  destination.searchParams.set('reason', reason);
  if (nextPath !== '/') {
    destination.searchParams.set('next', nextPath);
  }
  return NextResponse.redirect(destination);
}

/** Get. */
export async function GET(request: NextRequest) {
  const clientKey =
    process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY?.trim() ||
    process.env.TIKTOK_CLIENT_KEY?.trim() ||
    '';
  if (!clientKey) {
    return buildErrorRedirect(request, 'client_key_missing');
  }

  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get('next'), '/');
  const state = randomBytes(24).toString('base64url');
  const redirectUri = new URL('/api/auth/callback/tiktok', request.nextUrl.origin).toString();
  const authorizationUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authorizationUrl.searchParams.set('client_key', clientKey);
  authorizationUrl.searchParams.set('scope', 'user.info.basic');
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizationUrl);
  setOAuthCookie(response, STATE_COOKIE, state);
  setOAuthCookie(response, NEXT_COOKIE, encodeURIComponent(nextPath));
  return response;
}
