// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../_lib/backend-url';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${getBackendUrl()}/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Auth Proxy] verify-email error:', error);
    return NextResponse.json({ message: 'Falha ao verificar e-mail.' }, { status: 502 });
  }
}
