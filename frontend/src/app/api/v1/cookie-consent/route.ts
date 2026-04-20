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

/** Dynamic. */
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
  if (!value) {
    return null;
  }

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

function firstNonEmpty(candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    const value = candidate ?? '';
    if (value) {
      return value;
    }
  }
  return '';
}

function resolveAccessToken(request: NextRequest): string {
  return firstNonEmpty([
    request.headers.get('authorization')?.replace(BEARER_S_RE, ''),
    request.headers.get('x-kloel-access-token'),
    request.cookies.get('kloel_access_token')?.value,
    request.cookies.get('kloel_token')?.value,
  ]);
}

function resolveWorkspaceId(request: NextRequest): string {
  return firstNonEmpty([
    request.headers.get('x-workspace-id'),
    request.headers.get('x-kloel-workspace-id'),
    request.cookies.get('kloel_workspace_id')?.value,
  ]);
}

function buildConsentHeaders(
  accessToken: string,
  workspaceId: string,
  hasBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

interface ConsentUpstreamArgs {
  baseUrl: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: CookieConsentPreferences;
}

async function callConsentUpstream({ baseUrl, method, headers, body }: ConsentUpstreamArgs) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/cookie-consent`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    if (response.status === 404 || response.status === 405) {
      return null;
    }

    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch {
    return null;
  }
}

async function fetchBackendConsent(
  request: NextRequest,
  method: 'GET' | 'POST',
  body?: CookieConsentPreferences,
) {
  const headers = buildConsentHeaders(
    resolveAccessToken(request),
    resolveWorkspaceId(request),
    Boolean(body),
  );

  return findFirstSequential(getBackendCandidateUrls(), (baseUrl) =>
    callConsentUpstream({ baseUrl, method, headers, body }),
  );
}

/** Get. */
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

/** Post. */
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
import { findFirstSequential } from '@/lib/async-sequence';
