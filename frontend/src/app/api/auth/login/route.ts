// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getBackendUrl } from '../../_lib/backend-url';
import { setSharedAuthCookies } from '../_lib/shared-auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${getBackendUrl()}/auth/login`, {
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

    if (response.ok && data.access_token) {
      setSharedAuthCookies(request, res, data);
    }

    return res;
  } catch (error) {
    console.error('[Auth Proxy] login error:', error);
    return NextResponse.json({ message: 'Falha ao realizar login.' }, { status: 502 });
  }
}
