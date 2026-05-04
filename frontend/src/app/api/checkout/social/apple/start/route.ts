import { type NextRequest, NextResponse } from 'next/server';
import { writeCheckoutAppleState, type CheckoutAppleState } from '../state';

function normalizeRelativePath(value: string | null): string {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/';
  }
  return raw;
}

function appendError(returnTo: string, origin: string, reason: string): URL {
  const destination = new URL(returnTo, origin);
  destination.searchParams.set('apple_social_error', reason);
  return destination;
}

function readAppleClientId(): string {
  return (
    process.env.APPLE_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim() || ''
  );
}

/** Start checkout Apple social capture. */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')?.trim() || '';
  const deviceFingerprint = request.nextUrl.searchParams.get('deviceFingerprint')?.trim() || '';
  const returnTo = normalizeRelativePath(request.nextUrl.searchParams.get('returnTo'));

  if (!slug || !deviceFingerprint) {
    return NextResponse.redirect(appendError(returnTo, request.nextUrl.origin, 'missing_context'));
  }

  const clientId = readAppleClientId();
  if (!clientId) {
    return NextResponse.redirect(appendError(returnTo, request.nextUrl.origin, 'not_configured'));
  }

  const nonce = crypto.randomUUID();
  const state: CheckoutAppleState = {
    nonce,
    slug,
    checkoutCode: request.nextUrl.searchParams.get('checkoutCode')?.trim() || undefined,
    deviceFingerprint,
    returnTo,
    sourceUrl: new URL(returnTo, request.nextUrl.origin).toString(),
  };

  const redirectUri = new URL('/api/checkout/social/apple/callback', request.nextUrl.origin);
  const appleUrl = new URL('https://appleid.apple.com/auth/authorize');
  appleUrl.searchParams.set('client_id', clientId);
  appleUrl.searchParams.set('redirect_uri', redirectUri.toString());
  appleUrl.searchParams.set('response_type', 'code id_token');
  appleUrl.searchParams.set('scope', 'name email');
  appleUrl.searchParams.set('response_mode', 'form_post');
  appleUrl.searchParams.set('state', nonce);

  const response = NextResponse.redirect(appleUrl);
  writeCheckoutAppleState(response, state);
  return response;
}
