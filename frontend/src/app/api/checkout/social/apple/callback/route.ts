import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../../../_lib/backend-url';
import { clearCheckoutAppleState, readCheckoutAppleState } from '../state';

type AppleCallbackPayload = {
  identityToken?: string;
  authorizationCode?: string;
  state?: string;
  user?: {
    name?: {
      firstName?: string;
      lastName?: string;
    };
    email?: string;
  };
};

function appendResult(returnTo: string, origin: string, result: '1' | '0', reason?: string): URL {
  const destination = new URL(returnTo, origin);
  destination.searchParams.set('apple_social', result);
  if (reason) {
    destination.searchParams.set('apple_social_error', reason);
  }
  return destination;
}

function parseAppleUser(rawUser: FormDataEntryValue | null) {
  if (typeof rawUser !== 'string' || !rawUser.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawUser) as AppleCallbackPayload['user'];
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readAppleCallbackPayload(request: NextRequest): Promise<AppleCallbackPayload> {
  if (request.method === 'GET') {
    return {
      identityToken: request.nextUrl.searchParams.get('id_token')?.trim() || undefined,
      authorizationCode: request.nextUrl.searchParams.get('code')?.trim() || undefined,
      state: request.nextUrl.searchParams.get('state')?.trim() || undefined,
      user: parseAppleUser(request.nextUrl.searchParams.get('user')),
    };
  }

  const formData = await request.formData();
  return {
    identityToken: String(formData.get('id_token') || '').trim() || undefined,
    authorizationCode: String(formData.get('code') || '').trim() || undefined,
    state: String(formData.get('state') || '').trim() || undefined,
    user: parseAppleUser(formData.get('user')),
  };
}

async function handleAppleCheckoutCallback(request: NextRequest) {
  const storedState = readCheckoutAppleState(request);
  const returnTo = storedState?.returnTo || '/';
  const payload = await readAppleCallbackPayload(request);
  const backendUrl = getBackendUrl();

  const fail = (reason: string) => {
    const response = NextResponse.redirect(
      appendResult(returnTo, request.nextUrl.origin, '0', reason),
    );
    clearCheckoutAppleState(response);
    return response;
  };

  if (!storedState || !payload.state || payload.state !== storedState.nonce) {
    return fail('state_mismatch');
  }
  if (!payload.identityToken && !payload.authorizationCode) {
    return fail('missing_identity_token');
  }
  if (!backendUrl) {
    return fail('backend_not_configured');
  }

  try {
    const response = await fetch(`${backendUrl}/checkout/public/social-capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify({
        slug: storedState.slug,
        provider: 'apple',
        identityToken: payload.identityToken,
        authorizationCode: payload.authorizationCode,
        redirectUri: new URL(
          '/api/checkout/social/apple/callback',
          request.nextUrl.origin,
        ).toString(),
        user: payload.user,
        checkoutCode: storedState.checkoutCode,
        deviceFingerprint: storedState.deviceFingerprint,
        sourceUrl: storedState.sourceUrl,
        refererUrl: request.headers.get('referer') || undefined,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return fail('backend_rejected');
    }

    const success = NextResponse.redirect(appendResult(returnTo, request.nextUrl.origin, '1'));
    clearCheckoutAppleState(success);
    return success;
  } catch (error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    return fail(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unexpected_error');
  }
}

/** Get. */
export async function GET(request: NextRequest) {
  return handleAppleCheckoutCallback(request);
}

/** Post. */
export async function POST(request: NextRequest) {
  return handleAppleCheckoutCallback(request);
}
