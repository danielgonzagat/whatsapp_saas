import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../_lib/backend-url';
import { setSharedAuthCookies } from '../_lib/shared-auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      console.error('[Auth Proxy] facebook: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    const response = await fetch(`${backendUrl}/auth/oauth/facebook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));
    revalidateTag('auth', 'max');
    const res = NextResponse.json(data, { status: response.status });

    if (response.ok && data.access_token) {
      setSharedAuthCookies(request, res, data);
    }

    return res;
  } catch (error: unknown) {
    const errorName =
      error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    const isTimeout = errorName === 'TimeoutError' || errorName === 'AbortError';
    console.error(
      '[Auth Proxy] facebook oauth error:',
      isTimeout ? 'Request timed out (15s)' : error,
    );
    return NextResponse.json(
      {
        message: isTimeout
          ? 'Servidor demorou para responder. Tente novamente.'
          : 'Falha ao autenticar com Facebook.',
      },
      { status: 502 },
    );
  }
}
