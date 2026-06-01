import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../../_lib/backend-url';
import { setSharedAuthCookies } from '../../_lib/shared-auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${getBackendUrl()}/auth/mfa/verify`, {
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

    if (response.ok && (data.access_token || data.accessToken)) {
      setSharedAuthCookies(request, res, data);
    }

    return res;
  } catch (error) {
    console.error('[Auth Proxy] mfa verify error:', error);
    return NextResponse.json({ message: 'Falha ao confirmar 2FA.' }, { status: 502 });
  }
}
