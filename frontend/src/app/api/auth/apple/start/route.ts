import { type NextRequest, NextResponse } from 'next/server';
import { writeAuthAppleState } from '../state';
import { readAppleClientId } from '../../../_lib/apple-auth';

function sanitizeNextPath(value: string | null): string {
  if (!value?.trim()) {
    return '/';
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }
  return trimmed;
}

/** Start Apple OAuth flow for auth (login/register). */
export async function GET(request: NextRequest) {
  const clientId = readAppleClientId();
  if (!clientId) {
    const currentHost = request.headers.get('host') || request.nextUrl.host;
    const url = new URL(request.nextUrl.origin);
    url.host = currentHost;
    url.pathname = '/login';
    url.searchParams.set('error', 'apple_auth_failed');
    url.searchParams.set('reason', 'not_configured');
    return NextResponse.redirect(url);
  }

  const redirectUri = new URL('/api/auth/callback/apple', request.nextUrl.origin);
  const nonce = crypto.randomUUID();
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get('next'));
  const appleUrl = new URL('https://appleid.apple.com/auth/authorize');
  appleUrl.searchParams.set('client_id', clientId);
  appleUrl.searchParams.set('redirect_uri', redirectUri.toString());
  appleUrl.searchParams.set('response_type', 'code id_token');
  appleUrl.searchParams.set('scope', 'name email');
  appleUrl.searchParams.set('response_mode', 'form_post');
  appleUrl.searchParams.set('state', nonce);

  const response = NextResponse.redirect(appleUrl);
  writeAuthAppleState(response, { nextPath, nonce });
  return response;
}
