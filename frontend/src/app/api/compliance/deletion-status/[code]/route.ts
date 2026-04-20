import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/_lib/backend-url';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      console.error('[Compliance Proxy] deletion-status: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    const response = await fetch(
      `${backendUrl}/compliance/deletion-status/${encodeURIComponent(String(code || '').trim())}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const errorName =
      error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    const isTimeout = errorName === 'TimeoutError' || errorName === 'AbortError';
    console.error(
      '[Compliance Proxy] deletion-status error:',
      isTimeout ? 'Request timed out (15s)' : error,
    );
    return NextResponse.json(
      {
        message: isTimeout
          ? 'Servidor demorou para responder. Tente novamente.'
          : 'Falha ao consultar o status da exclusão.',
      },
      { status: 502 },
    );
  }
}
