import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../../_lib/backend-url';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let lastError: unknown;

    // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
    for (const baseUrl of getBackendCandidateUrls()) {
      const response = await fetch(`${baseUrl}/auth/whatsapp/send-code`, {
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

      if (!response) continue;
      if (response.status === 404 || response.status === 405) {
        lastError = new Error(`upstream ${response.status} at ${baseUrl}/auth/whatsapp/send-code`);
        continue;
      }

      const data = await response.json().catch(() => ({}));
      revalidateTag('auth', 'max');
      return NextResponse.json(data, { status: response.status });
    }

    throw lastError || new Error('Unable to reach WhatsApp send-code endpoint');
  } catch (error) {
    console.error('[Auth Proxy] whatsapp send-code error:', error);
    return NextResponse.json({ message: 'Erro ao enviar código' }, { status: 502 });
  }
}
