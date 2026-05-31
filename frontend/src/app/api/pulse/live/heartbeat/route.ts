import { findFirstSequential } from '@/lib/async-sequence';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../../_lib/backend-url';

const UPSTREAM_TIMEOUT_MS = 5_000;

/** Resolve the Authorization header from the forwarded header or session cookies. */
function resolveAuthHeader(request: NextRequest): string {
  const forwardedAuthorization = request.headers.get('authorization') || '';
  const accessToken =
    request.headers.get('x-kloel-access-token') ||
    request.cookies.get('kloel_access_token')?.value ||
    request.cookies.get('kloel_token')?.value ||
    '';
  return forwardedAuthorization || (accessToken ? `Bearer ${accessToken}` : '');
}

/** Resolve the workspace id from headers or session cookies. */
function resolveWorkspaceId(request: NextRequest): string {
  return (
    request.headers.get('x-workspace-id') ||
    request.headers.get('x-kloel-workspace-id') ||
    request.cookies.get('kloel_workspace_id')?.value ||
    ''
  );
}

type AttemptResult = {
  response: NextResponse | null;
  error: unknown;
};

/** Build the upstream heartbeat fetch options for a single backend candidate. */
function buildHeartbeatRequest(
  authHeader: string,
  workspaceId: string,
  body: unknown,
): RequestInit {
  return {
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
  };
}

/** Attempt a single upstream heartbeat POST; returns the response or a recorded error. */
async function attemptHeartbeat(
  baseUrl: string,
  authHeader: string,
  workspaceId: string,
  body: unknown,
): Promise<AttemptResult> {
  const url = `${baseUrl}/pulse/live/heartbeat`;
  const attempt = await fetch(url, buildHeartbeatRequest(authHeader, workspaceId, body)).catch(
    (error) => ({ error }) as const,
  );

  if (attempt && 'error' in attempt) {
    return { response: null, error: attempt.error };
  }
  if (!attempt) {
    return { response: null, error: null };
  }
  if (attempt.status === 404 || attempt.status === 405) {
    return { response: null, error: new Error(`upstream ${attempt.status} at ${url}`) };
  }

  const data = await attempt.json().catch(() => ({}));
  return { response: NextResponse.json(data, { status: attempt.status }), error: null };
}

/** Post. */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Payload inválido.' }, { status: 400 });
  }

  const authHeader = resolveAuthHeader(request);
  const workspaceId = resolveWorkspaceId(request);

  if (!authHeader) {
    return NextResponse.json({ message: 'Sessão ausente.' }, { status: 401 });
  }

  let lastError: unknown;

  const response = await findFirstSequential(getBackendCandidateUrls(), async (baseUrl) => {
    const result = await attemptHeartbeat(baseUrl, authHeader, workspaceId, body);
    if (result.error !== null) {
      lastError = result.error;
    }
    return result.response;
  });

  if (response) {
    return response;
  }

  console.error('[Pulse Proxy] heartbeat error:', lastError);
  return NextResponse.json(
    { message: 'Falha ao registrar heartbeat do frontend.' },
    { status: 502 },
  );
}
