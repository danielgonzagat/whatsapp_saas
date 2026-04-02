// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getBackendUrl } from '../../_lib/backend-url';

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

    // Set auth cookie so middleware can detect authenticated users
    if (response.ok && data.access_token) {
      res.cookies.set('kloel_auth', '1', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }

    return res;
  } catch (error) {
    console.error('[Auth Proxy] login error:', error);
    return NextResponse.json({ message: 'Falha ao realizar login.' }, { status: 502 });
  }
}
