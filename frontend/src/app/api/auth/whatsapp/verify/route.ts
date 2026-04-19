import { revalidateTag } from 'next/cache';
// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../../_lib/backend-url';
import { hasSharedAuthToken, setSharedAuthCookies } from '../../_lib/shared-auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const candidates = getBackendCandidateUrls();
    if (!candidates.length) {
      console.error('[Auth Proxy] whatsapp verify: BACKEND_URL not configured');
      return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
    }

    let lastError: unknown;

    // biome-ignore lint/performance/noAwaitInLoops: WhatsApp OTP verification failover — must try one backend at a time because success sets auth cookies on the response; parallel fan-out would race on setSharedAuthCookies and also double-invalidate the OTP server-side
    for (const baseUrl of candidates) {
      const response = await fetch(`${baseUrl}/auth/whatsapp/verify`, {
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
        lastError = new Error(`upstream ${response.status} at ${baseUrl}/auth/whatsapp/verify`);
        continue;
      }

      const data = await response.json().catch(() => ({}));
      revalidateTag('auth', 'max');
      const res = NextResponse.json(data, { status: response.status });

      if (response.ok && hasSharedAuthToken(data)) {
        setSharedAuthCookies(request, res, data);
      }

      return res;
    }

    throw lastError || new Error('Unable to reach WhatsApp verify endpoint');
  } catch (error) {
    console.error('[Auth Proxy] whatsapp verify error:', error);
    return NextResponse.json({ message: 'Erro ao verificar código' }, { status: 502 });
  }
}
