import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

export async function POST(request: NextRequest) {
  try {
    const candidates = getBackendCandidateUrls();
    if (!candidates.length) {
      console.error('[Auth Proxy] anonymous: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    let lastError: unknown;

    // biome-ignore lint/performance/noAwaitInLoops: anonymous-session backend failover — first 2xx creates one guest session; parallel fan-out would allocate multiple GuestSession rows and tie a single client IP to N unrelated workspace trials
    for (const baseUrl of candidates) {
      const response = await fetch(`${baseUrl}/auth/anonymous`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
        },
        cache: 'no-store',
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!response) continue;
      if (response.status === 404 || response.status === 405) {
        lastError = new Error(`upstream ${response.status} at ${baseUrl}/auth/anonymous`);
        continue;
      }

      const data = await response.json().catch(() => ({}));
      revalidateTag('auth', 'max');
      return NextResponse.json(data, { status: response.status });
    }

    throw lastError || new Error('Unable to reach anonymous auth endpoint');
  } catch (error) {
    console.error('[Auth Proxy] anonymous error:', error);
    return NextResponse.json({ message: 'Falha ao criar sessão anônima.' }, { status: 502 });
  }
}
