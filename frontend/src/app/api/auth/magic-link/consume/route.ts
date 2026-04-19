import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../../_lib/backend-url';
import { hasSharedAuthToken, setSharedAuthCookies } from '../../_lib/shared-auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      console.error('[Auth Proxy] magic-link consume: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    const response = await fetch(`${backendUrl}/auth/magic-link/consume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    revalidateTag('auth', 'max');
    const res = NextResponse.json(data, { status: response.status });

    if (response.ok && hasSharedAuthToken(data)) {
      setSharedAuthCookies(request, res, data);
    }

    return res;
  } catch (error) {
    console.error('[Auth Proxy] magic-link consume error:', error);
    return NextResponse.json(
      { message: 'Falha ao validar link mágico.' },
      { status: 502 },
    );
  }
}
