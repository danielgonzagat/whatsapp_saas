import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

const PATTERN_RE = /-/g;
const PATTERN_RE_2 = /_/g;

const BEARER_S_RE = /^Bearer\s+(.+)$/i;

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function decodeJwtPayload(authHeader: string): Record<string, unknown> | null {
  const match = authHeader.match(BEARER_S_RE);
  const token = match?.[1];
  if (!token) return null;

  const [, payload = ''] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(PATTERN_RE, '+').replace(PATTERN_RE_2, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeWorkspaceMeResponse(data: unknown, authHeader: string) {
  const dataRecord = readRecord(data);

  if (dataRecord?.user) {
    return data;
  }

  if (!dataRecord || typeof dataRecord.id !== 'string') {
    return data;
  }

  const payload = decodeJwtPayload(authHeader);
  if (!payload) {
    return data;
  }

  const email = readString(payload.email);
  const workspaceId = readString(payload.workspaceId) || dataRecord.id;

  return {
    user: {
      id: readString(payload.sub),
      email,
      name: readString(payload.name).trim().length
        ? readString(payload.name)
        : email.split('@')[0] || 'User',
      workspaceId,
      role: readString(payload.role) || undefined,
    },
    workspaces: [
      {
        id: dataRecord.id,
        name: typeof dataRecord.name === 'string' ? dataRecord.name : 'Workspace',
      },
    ],
    workspace: dataRecord,
  };
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value) return value;
  }
  return '';
}

function resolveAccessToken(request: NextRequest): string {
  return pickFirstNonEmpty(
    request.headers.get('x-kloel-access-token'),
    request.cookies.get('kloel_access_token')?.value,
    request.cookies.get('kloel_token')?.value,
  );
}

function resolveWorkspaceId(request: NextRequest): string {
  return pickFirstNonEmpty(
    request.headers.get('x-workspace-id'),
    request.headers.get('x-kloel-workspace-id'),
    request.cookies.get('kloel_workspace_id')?.value,
  );
}

function resolveAuthHeader(request: NextRequest): string {
  const forwardedAuthorization = request.headers.get('authorization') || '';
  if (forwardedAuthorization) return forwardedAuthorization;
  const accessToken = resolveAccessToken(request);
  return accessToken ? `Bearer ${accessToken}` : '';
}

type UpstreamAttempt = { response: Response; baseUrl: string } | { error: Error };

async function tryUpstream(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<UpstreamAttempt> {
  const response = await fetch(`${baseUrl}/workspace/me`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  }).catch((error: unknown) => {
    return { __error: error };
  });

  if (response && typeof response === 'object' && '__error' in response) {
    const err = response.__error;
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }

  const realResponse = response as Response;
  if (realResponse.status === 404 || realResponse.status === 405) {
    return {
      error: new Error(`upstream ${realResponse.status} at ${baseUrl}/workspace/me`),
    };
  }
  return { response: realResponse, baseUrl };
}

async function fetchWorkspaceFromUpstreams(
  headers: Record<string, string>,
  authHeader: string,
): Promise<NextResponse> {
  let lastError: Error | null = null;

  // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
  for (const baseUrl of getBackendCandidateUrls()) {
    const attempt = await tryUpstream(baseUrl, headers);
    if ('error' in attempt) {
      lastError = attempt.error;
      continue;
    }

    const data = await attempt.response.json().catch(() => ({}));
    return NextResponse.json(normalizeWorkspaceMeResponse(data, authHeader), {
      status: attempt.response.status,
    });
  }

  throw lastError || new Error('Unable to reach workspace backend endpoint');
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = resolveAuthHeader(request);
    const workspaceId = resolveWorkspaceId(request);
    const headers = {
      Authorization: authHeader,
      'x-workspace-id': workspaceId,
      Accept: 'application/json',
    };

    return await fetchWorkspaceFromUpstreams(headers, authHeader);
  } catch (error) {
    console.error('[Workspace Proxy] me error:', error);
    return NextResponse.json({ message: 'Falha ao carregar workspace.' }, { status: 502 });
  }
}
