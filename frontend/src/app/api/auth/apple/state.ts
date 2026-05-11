import { type NextRequest, NextResponse } from 'next/server';

export type AuthAppleState = {
  nextPath?: string;
  nonce: string;
};

const COOKIE_NAME = 'kloel_auth_apple_state';
const MAX_AGE_SECONDS = 10 * 60;

function encodeState(state: AuthAppleState): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

function decodeState(raw: string): AuthAppleState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as AuthAppleState;
    return parsed?.nonce ? parsed : null;
  } catch {
    return null;
  }
}

export function readAuthAppleState(request: NextRequest): AuthAppleState | null {
  const raw = request.cookies.get(COOKIE_NAME)?.value || '';
  return raw ? decodeState(raw) : null;
}

export function writeAuthAppleState(response: NextResponse, state: AuthAppleState): void {
  response.cookies?.set(COOKIE_NAME, encodeState(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/api/auth',
  });
}

export function clearAuthAppleState(response: NextResponse): void {
  response.cookies?.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/auth',
  });
}
