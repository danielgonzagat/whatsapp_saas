import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
import { findFirstSequential } from '@/lib/async-sequence';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../../_lib/backend-url';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let lastError: unknown;

    const response = await findFirstSequential(getBackendCandidateUrls(), async (baseUrl) => {
      const attempt = await fetch(`${baseUrl}/auth/whatsapp/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!attempt) {
        return null;
      }
      if (attempt.status === 404 || attempt.status === 405) {
        lastError = new Error(`upstream ${attempt.status} at ${baseUrl}/auth/whatsapp/send-code`);
        return null;
      }
      return attempt;
    });

    if (!response) {
      throw lastError || new Error('Unable to reach WhatsApp send-code endpoint');
    }

    const data = await response.json().catch(() => ({}));
    revalidateTag('auth', 'max');
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Auth Proxy] whatsapp send-code error:', error);
    return NextResponse.json({ message: 'Erro ao enviar código' }, { status: 502 });
  }
}
