import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

export async function POST(request: NextRequest) {
  try {
    let lastError: unknown;

    // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
    for (const baseUrl of getBackendCandidateUrls()) {
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
