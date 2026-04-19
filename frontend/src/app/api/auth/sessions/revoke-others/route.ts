import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../../_lib/backend-url';

export async function POST(request: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      console.error('[Auth Proxy] revoke-other sessions: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    const response = await fetch(`${backendUrl}/auth/sessions/revoke-others`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') || '',
        Authorization: request.headers.get('authorization') || '',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Auth Proxy] revoke-other sessions error:', error);
    return NextResponse.json(
      { message: 'Falha ao encerrar as outras sessões.' },
      { status: 502 },
    );
  }
}
