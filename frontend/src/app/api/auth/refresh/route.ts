// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getBackendUrl } from '../../_lib/backend-url';

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
      res.cookies.set('kloel_auth', '1', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
    }

    return res;
  } catch (error) {
    console.error('[Auth Proxy] refresh error:', error);
    return NextResponse.json({ message: 'Falha ao renovar sessão.' }, { status: 502 });
  }
}
