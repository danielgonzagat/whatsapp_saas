import type {
  CookieConsentPayload,
  CookieConsentPreferences,
} from '@/components/kloel/cookies/cookie-types';
import { getSharedCookieDomain } from '@/lib/subdomains';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

const BEARER_S_RE = /^Bearer\s+/i;

const COOKIE_NAME = 'kloel_consent';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const dynamic = 'force-dynamic';

function normalizeConsent(
  input?: CookieConsentPayload | (CookieConsentPreferences & { updatedAt?: string }) | null,
): CookieConsentPreferences {
  const updatedAt =
    input && 'updatedAt' in input && typeof input.updatedAt === 'string' && input.updatedAt.trim()
      ? input.updatedAt
      : new Date().toISOString();

  return {
    necessary: true,
    analytics: Boolean(input?.analytics),
    marketing: Boolean(input?.marketing),
    updatedAt,
  };
}

function parseConsentCookie(rawValue?: string | null): CookieConsentPreferences | null {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  try {
    return normalizeConsent(JSON.parse(value));
  } catch {
    return null;
  }
}

function resolveCookieOptions(request: NextRequest) {
  const domain = getSharedCookieDomain(request.headers.get('host') || request.nextUrl.host);
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {}),
  };
}

function withConsentCookie(
  request: NextRequest,
  response: NextResponse,
  consent: CookieConsentPreferences | null,
) {
  if (!consent) {
    return response;
  }

  response.cookies.set(COOKIE_NAME, JSON.stringify(consent), resolveCookieOptions(request));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function resolveAccessToken(request: NextRequest): string {
  return (
    request.headers.get('authorization')?.replace(BEARER_S_RE, '') ||
    request.headers.get('x-kloel-access-token') ||
    request.cookies.get('kloel_access_token')?.value ||
    request.cookies.get('kloel_token')?.value ||
    ''
  );
}

function resolveWorkspaceId(request: NextRequest): string {
  return (
    request.headers.get('x-workspace-id') ||
    request.headers.get('x-kloel-workspace-id') ||
    request.cookies.get('kloel_workspace_id')?.value ||
    ''
  );
}

async function fetchBackendConsent(
  request: NextRequest,
  method: 'GET' | 'POST',
  body?: CookieConsentPreferences,
) {
  const accessToken = resolveAccessToken(request);
  const workspaceId = resolveWorkspaceId(request);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  for (const baseUrl of getBackendCandidateUrls()) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/cookie-consent`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });

      if (response.status === 404 || response.status === 405) {
        continue;
      }

      const data = await response.json().catch(() => ({}));
      return { response, data };
    } catch {
      continue;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const cookieConsent = parseConsentCookie(request.cookies.get(COOKIE_NAME)?.value || null);
  const backendResult = await fetchBackendConsent(request, 'GET');

  if (backendResult) {
    const upstreamConsent = backendResult.data?.consent
      ? normalizeConsent(backendResult.data.consent)
      : cookieConsent;
    const response = NextResponse.json({ consent: upstreamConsent }, { status: 200 });
    return withConsentCookie(request, response, upstreamConsent);
  }

  return withConsentCookie(
    request,
    NextResponse.json({ consent: cookieConsent }, { status: 200 }),
    cookieConsent,
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.json().catch(() => ({}));
  const requestedConsent = normalizeConsent(rawBody);
  const backendResult = await fetchBackendConsent(request, 'POST', requestedConsent);
  const finalConsent = backendResult?.data?.consent
    ? normalizeConsent(backendResult.data.consent)
    : requestedConsent;

  const response = NextResponse.json(
    {
      success: true,
      consent: finalConsent,
    },
    { status: backendResult?.response.ok ? backendResult.response.status : 200 },
  );

  return withConsentCookie(request, response, finalConsent);
}
