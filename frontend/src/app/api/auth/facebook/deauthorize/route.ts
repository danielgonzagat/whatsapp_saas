import { getBackendUrl } from '@/app/api/_lib/backend-url';
import { type NextRequest, NextResponse } from 'next/server';

/** Get. */
export function GET() {
  return NextResponse.json({ message: 'Use POST.' }, { status: 405, headers: { Allow: 'POST' } });
}

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      console.error('[Auth Proxy] facebook/deauthorize: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    const body = await request.text();
    const response = await fetch(`${backendUrl}/auth/facebook/deauthorize`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type':
          request.headers.get('content-type') || 'application/x-www-form-urlencoded',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
      body,
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
      '[Auth Proxy] facebook/deauthorize error:',
      isTimeout ? 'Request timed out (15s)' : error,
    );
    return NextResponse.json(
      {
        message: isTimeout
          ? 'Servidor demorou para responder. Tente novamente.'
          : 'Falha ao processar a desautorização do Facebook.',
      },
      { status: 502 },
    );
  }
}
