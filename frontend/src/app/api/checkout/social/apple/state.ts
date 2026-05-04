import { type NextRequest, NextResponse } from 'next/server';

export type CheckoutAppleState = {
  nonce: string;
  slug: string;
  checkoutCode?: string;
  deviceFingerprint: string;
  returnTo: string;
  sourceUrl: string;
};

const COOKIE_NAME = 'kloel_checkout_apple_state';
const MAX_AGE_SECONDS = 10 * 60;

function encodeState(state: CheckoutAppleState): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

function decodeState(raw: string): CheckoutAppleState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CheckoutAppleState;
    if (parsed?.nonce && parsed.slug && parsed.deviceFingerprint && parsed.returnTo) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function readCheckoutAppleState(request: NextRequest): CheckoutAppleState | null {
  const raw = request.cookies.get(COOKIE_NAME)?.value || '';
  return raw ? decodeState(raw) : null;
}

export function writeCheckoutAppleState(response: NextResponse, state: CheckoutAppleState): void {
  response.cookies.set(COOKIE_NAME, encodeState(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/api/checkout/social/apple',
  });
}

export function clearCheckoutAppleState(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/checkout/social/apple',
  });
}
