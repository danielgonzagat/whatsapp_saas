import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
// Client callers invoke mutate('auth') after receiving this response
import { findFirstSequential } from '@/lib/async-sequence';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

export async function POST(request: NextRequest) {
  try {
    let lastError: unknown;

    const response = await findFirstSequential(getBackendCandidateUrls(), async (baseUrl) => {
      const attempt = await fetch(`${baseUrl}/auth/anonymous`, {
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

      if (!attempt) return null;
      if (attempt.status === 404 || attempt.status === 405) {
        lastError = new Error(`upstream ${attempt.status} at ${baseUrl}/auth/anonymous`);
        return null;
      }
      return attempt;
    });

    if (!response) {
      throw lastError || new Error('Unable to reach anonymous auth endpoint');
    }

    const data = await response.json().catch(() => ({}));
    revalidateTag('auth', 'max');
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Auth Proxy] anonymous error:', error);
    return NextResponse.json({ message: 'Falha ao criar sessão anônima.' }, { status: 502 });
  }
}
