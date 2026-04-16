// PULSE:OK — server-side heartbeat proxy forwards telemetry only; there is no SWR cache key to invalidate in this route.
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../../_lib/backend-url';

const UPSTREAM_TIMEOUT_MS = 5_000;

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Payload inválido.' }, { status: 400 });
  }

  const forwardedAuthorization = request.headers.get('authorization') || '';
  const accessToken =
    request.headers.get('x-kloel-access-token') ||
    request.cookies.get('kloel_access_token')?.value ||
    request.cookies.get('kloel_token')?.value ||
    '';
  const authHeader = forwardedAuthorization || (accessToken ? `Bearer ${accessToken}` : '');
  const workspaceId =
    request.headers.get('x-workspace-id') ||
    request.headers.get('x-kloel-workspace-id') ||
    request.cookies.get('kloel_workspace_id')?.value ||
    '';

  if (!authHeader) {
    return NextResponse.json({ message: 'Sessão ausente.' }, { status: 401 });
  }

  let lastError: unknown;

  // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
  for (const baseUrl of getBackendCandidateUrls()) {
    const response = await fetch(`${baseUrl}/pulse/live/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'x-workspace-id': workspaceId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    }).catch((error) => {
      lastError = error;
      return null;
    });

    if (!response) {
      continue;
    }

    if (response.status === 404 || response.status === 405) {
      lastError = new Error(`upstream ${response.status} at ${baseUrl}/pulse/live/heartbeat`);
      continue;
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  }

  console.error('[Pulse Proxy] heartbeat error:', lastError);
  return NextResponse.json(
    { message: 'Falha ao registrar heartbeat do frontend.' },
    { status: 502 },
  );
}
