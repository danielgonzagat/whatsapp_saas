import { getBackendUrl } from '@/app/api/_lib/backend-url';
import { legalConstants } from '@/lib/legal-constants';
import { type NextRequest, NextResponse } from 'next/server';

function buildUnavailableResponse() {
  console.error('[Auth Proxy] facebook/data-deletion: BACKEND_URL not configured');
  return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
}

/** Get. */
export function GET() {
  return NextResponse.redirect(legalConstants.urls.dataDeletion, { status: 307 });
}

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      return buildUnavailableResponse();
    }

    const body = await request.text();
    const response = await fetch(`${backendUrl}/auth/facebook/data-deletion`, {
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
      '[Auth Proxy] facebook/data-deletion error:',
      isTimeout ? 'Request timed out (15s)' : error,
    );
    return NextResponse.json(
      {
        message: isTimeout
          ? 'Servidor demorou para responder. Tente novamente.'
          : 'Falha ao processar a exclusão de dados do Facebook.',
      },
      { status: 502 },
    );
  }
}
