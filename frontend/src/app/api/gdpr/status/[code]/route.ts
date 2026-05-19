import { getBackendUrl } from '@/app/api/_lib/backend-url';
import { type NextRequest, NextResponse } from 'next/server';

/** Get GDPR request status. */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      return NextResponse.json({ message: 'Backend não configurado.' }, { status: 503 });
    }

    const response = await fetch(
      `${backendUrl}/gdpr/status/${encodeURIComponent(String(code || '').trim())}`,
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
    return NextResponse.json(
      {
        message: isTimeout
          ? 'Servidor demorou para responder. Tente novamente.'
          : 'Falha ao consultar o status.',
      },
      { status: 502 },
    );
  }
}
