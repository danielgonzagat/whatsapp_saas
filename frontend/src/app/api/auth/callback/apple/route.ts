import { parseAppleAuthState } from '@/lib/apple-auth-state';
import { buildAppUrl, buildAuthUrl, sanitizeNextPath } from '@/lib/subdomains';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../../_lib/backend-url';
import { hasSharedAuthToken, setSharedAuthCookies } from '../../_lib/shared-auth-cookies';

type AppleCallbackPayload = {
  identityToken?: string;
  user?: Record<string, unknown>;
  nextPath: string;
  rawState?: string;
};

function parseOptionalJson(value: FormDataEntryValue | string | null) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function mapAppleError(rawError: string) {
  const normalized = rawError.trim().toLowerCase();
  if (normalized === 'user_cancelled_authorize' || normalized === 'access_denied') {
    return 'apple_user_cancelled';
  }
  return 'apple_oauth_failed';
}

function resolveNextPath(rawState?: string | null, rawNext?: string | null) {
  return parseAppleAuthState(rawState, rawNext).nextPath;
}

function buildAuthErrorRedirect(
  request: NextRequest,
  error: string,
  nextPath = '/',
  extras?: Record<string, string>,
) {
  const destination = new URL(
    buildAuthUrl('/login', request.headers.get('host') || request.nextUrl.host),
  );
  destination.searchParams.set('forceAuth', '1');
  destination.searchParams.set('error', error);
  if (nextPath && nextPath !== '/') {
    destination.searchParams.set('next', nextPath);
  }
  for (const [key, value] of Object.entries(extras || {})) {
    if (value) {
      destination.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(destination);
}

function buildAppSuccessRedirect(request: NextRequest, nextPath: string) {
  const destination = new URL(
    buildAppUrl(nextPath, request.headers.get('host') || request.nextUrl.host),
  );
  destination.searchParams.set('auth', '1');
  return destination;
}

function buildCheckoutRedirect(request: NextRequest, nextPath: string, extras?: Record<string, string>) {
  const destination = new URL(nextPath, request.nextUrl.origin);
  for (const [key, value] of Object.entries(extras || {})) {
    if (value) {
      destination.searchParams.set(key, value);
    }
  }
  return NextResponse.redirect(destination);
}

async function readPostPayload(request: NextRequest): Promise<AppleCallbackPayload | null> {
  const form = await request.formData();
  const identityToken = String(form.get('id_token') || '').trim();
  const nextPath = resolveNextPath(String(form.get('state') || ''), request.nextUrl.searchParams.get('next'));

  return {
    identityToken: identityToken || undefined,
    user: parseOptionalJson(form.get('user')),
    nextPath,
    rawState: String(form.get('state') || '').trim() || undefined,
  };
}

function readGetPayload(request: NextRequest): AppleCallbackPayload | null {
  const identityToken = request.nextUrl.searchParams.get('id_token')?.trim() || '';
  const nextPath = resolveNextPath(
    request.nextUrl.searchParams.get('state'),
    request.nextUrl.searchParams.get('next'),
  );

  return {
    identityToken: identityToken || undefined,
    user: parseOptionalJson(request.nextUrl.searchParams.get('user')),
    nextPath,
    rawState: request.nextUrl.searchParams.get('state')?.trim() || undefined,
  };
}

async function completeAppleCallback(request: NextRequest, payload: AppleCallbackPayload | null) {
  const parsedState = parseAppleAuthState(
    payload?.rawState || request.nextUrl.searchParams.get('state'),
    request.nextUrl.searchParams.get('next'),
  );
  const nextPath = payload?.nextPath || parsedState.nextPath;

  if (!payload?.identityToken) {
    if (parsedState.checkout) {
      return buildCheckoutRedirect(request, parsedState.checkout.returnPath, {
        socialAuthError: 'apple_invalid_response',
        socialAuthProvider: 'apple',
      });
    }

    return buildAuthErrorRedirect(request, 'apple_invalid_response', nextPath);
  }

  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    if (parsedState.checkout) {
      return buildCheckoutRedirect(request, parsedState.checkout.returnPath, {
        socialAuthError: 'apple_not_configured',
        socialAuthProvider: 'apple',
      });
    }

    return buildAuthErrorRedirect(request, 'apple_not_configured', nextPath);
  }

  if (parsedState.checkout) {
    try {
      const response = await fetch(`${backendUrl}/checkout/public/social-capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
        },
        body: JSON.stringify({
          slug: parsedState.checkout.slug,
          provider: 'apple',
          identityToken: payload.identityToken,
          user: payload.user,
          checkoutCode: parsedState.checkout.checkoutCode,
          deviceFingerprint: parsedState.checkout.deviceFingerprint,
          sourceUrl: parsedState.checkout.sourceUrl,
          refererUrl: parsedState.checkout.refererUrl,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return buildCheckoutRedirect(request, parsedState.checkout.returnPath, {
          socialAuthError: 'apple_oauth_failed',
          socialAuthProvider: 'apple',
        });
      }

      return buildCheckoutRedirect(request, parsedState.checkout.returnPath);
    } catch {
      return buildCheckoutRedirect(request, parsedState.checkout.returnPath, {
        socialAuthError: 'apple_oauth_failed',
        socialAuthProvider: 'apple',
      });
    }
  }

  try {
    const response = await fetch(`${backendUrl}/auth/oauth/apple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
        body: JSON.stringify({
          identityToken: payload.identityToken,
          user: payload.user,
        }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !hasSharedAuthToken(data)) {
      if (response.status === 409 && data?.error === 'oauth_link_confirmation_required') {
        return buildAuthErrorRedirect(
          request,
          'apple_oauth_confirmation_required',
          payload.nextPath,
          {
            notice: 'oauth_link_confirmation_required',
            provider: 'apple',
          },
        );
      }
      return buildAuthErrorRedirect(request, 'apple_oauth_failed', payload.nextPath);
    }

    const redirectResponse = NextResponse.redirect(
      buildAppSuccessRedirect(request, payload.nextPath),
    );
    setSharedAuthCookies(request, redirectResponse, data);
    return redirectResponse;
  } catch {
    return buildAuthErrorRedirect(request, 'apple_oauth_failed', payload.nextPath);
  }
}

export async function GET(request: NextRequest) {
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) {
    const parsedState = parseAppleAuthState(
      request.nextUrl.searchParams.get('state'),
      request.nextUrl.searchParams.get('next'),
    );
    if (parsedState.checkout) {
      return buildCheckoutRedirect(request, parsedState.checkout.returnPath, {
        socialAuthError: mapAppleError(providerError),
        socialAuthProvider: 'apple',
      });
    }

    return buildAuthErrorRedirect(
      request,
      mapAppleError(providerError),
      resolveNextPath(request.nextUrl.searchParams.get('state'), request.nextUrl.searchParams.get('next')),
    );
  }

  return completeAppleCallback(request, readGetPayload(request));
}

export async function POST(request: NextRequest) {
  return completeAppleCallback(request, await readPostPayload(request));
}
