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
      sessionId: readString(payload.sessionId) || undefined,
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

export async function GET(request: NextRequest) {
  try {
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
    const headers = {
      Authorization: authHeader,
      'x-workspace-id': workspaceId,
      Accept: 'application/json',
    };

    let lastError: unknown;

    // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
    for (const baseUrl of getBackendCandidateUrls()) {
      const response = await fetch(`${baseUrl}/workspace/me`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!response) continue;
      if (response.status === 404 || response.status === 405) {
        lastError = new Error(`upstream ${response.status} at ${baseUrl}/workspace/me`);
        continue;
      }

      const data = await response.json().catch(() => ({}));
      return NextResponse.json(normalizeWorkspaceMeResponse(data, authHeader), {
        status: response.status,
      });
    }

    throw lastError || new Error('Unable to reach workspace backend endpoint');
  } catch (error) {
    console.error('[Workspace Proxy] me error:', error);
    return NextResponse.json({ message: 'Falha ao carregar workspace.' }, { status: 502 });
  }
}
