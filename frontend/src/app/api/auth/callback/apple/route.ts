import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { buildAppUrl, buildAuthUrl } from '@/lib/subdomains';
import { getBackendUrl } from '../../../_lib/backend-url';
import { setSharedAuthCookies } from '../../_lib/shared-auth-cookies';

type AppleCallbackPayload = {
  identityToken: string;
  user?: {
    name?: {
      firstName?: string;
      lastName?: string;
    };
    email?: string;
  };
};

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

async function readAppleCallbackPayload(request: NextRequest): Promise<AppleCallbackPayload | null> {
  if (request.method === 'GET') {
    const identityToken = request.nextUrl.searchParams.get('id_token')?.trim() || '';
    if (!identityToken) {
      return null;
    }

    return {
      identityToken,
      user: parseAppleUser(request.nextUrl.searchParams.get('user')),
    };
  }

  const formData = await request.formData();
  const identityToken = String(formData.get('id_token') || '').trim();
  if (!identityToken) {
    return null;
  }

  return {
    identityToken,
    user: parseAppleUser(formData.get('user')),
  };
}

function buildErrorRedirect(request: NextRequest, reason: string) {
  const currentHost = request.headers.get('host') || request.nextUrl.host;
  const destination = new URL(buildAuthUrl('/login', currentHost));
  destination.searchParams.set('error', 'apple_auth_failed');
  destination.searchParams.set('reason', reason);
  return NextResponse.redirect(destination);
}

async function handleAppleCallback(request: NextRequest) {
  const payload = await readAppleCallbackPayload(request);
  if (!payload?.identityToken) {
    return buildErrorRedirect(request, 'missing_identity_token');
  }

  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return buildErrorRedirect(request, 'backend_not_configured');
  }

  try {
    const response = await fetch(`${backendUrl}/auth/oauth/apple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      return buildErrorRedirect(request, 'backend_rejected');
    }

    revalidateTag('auth', 'max');
    const currentHost = request.headers.get('host') || request.nextUrl.host;
    const successRedirect = NextResponse.redirect(new URL(buildAppUrl('/', currentHost)));
    setSharedAuthCookies(request, successRedirect, data);
    return successRedirect;
  } catch (error: unknown) {
    const errorName =
      error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    return buildErrorRedirect(
      request,
      errorName === 'TimeoutError' || errorName === 'AbortError' ? 'timeout' : 'unexpected_error',
    );
  }
}

export async function GET(request: NextRequest) {
  return handleAppleCallback(request);
}

export async function POST(request: NextRequest) {
  return handleAppleCallback(request);
}
