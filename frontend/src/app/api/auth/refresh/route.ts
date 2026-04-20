import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../_lib/backend-url';
import { setSharedAuthCookies } from '../_lib/shared-auth-cookies';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${getBackendUrl()}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    revalidateTag('auth', 'max');
    const res = NextResponse.json(data, { status: response.status });

    if (response.ok && (data.access_token || data.accessToken)) {
      setSharedAuthCookies(request, res, data);
    }

    return res;
  } catch (error) {
    console.error('[Auth Proxy] refresh error:', error);
    return NextResponse.json({ message: 'Falha ao renovar sessão.' }, { status: 502 });
  }
}
