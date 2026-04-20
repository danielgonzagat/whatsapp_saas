import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '../../../_lib/backend-url';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      console.error('[Auth Proxy] magic-link/request: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    const response = await fetch(`${backendUrl}/auth/magic-link/request`, {
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
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const errorName =
      error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    const isTimeout = errorName === 'TimeoutError' || errorName === 'AbortError';
    console.error(
      '[Auth Proxy] magic-link request error:',
      isTimeout ? 'Request timed out (15s)' : error,
    );
    return NextResponse.json(
      {
        message: isTimeout
          ? 'Servidor demorou para responder. Tente novamente.'
          : 'Falha ao enviar o link mágico.',
      },
      { status: 502 },
    );
  }
}
