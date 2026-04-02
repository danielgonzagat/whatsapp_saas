import { NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

function decodeJwtPayload(authHeader: string) {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) return null;

  const [, payload = ''] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeWorkspaceMeResponse(data: any, authHeader: string) {
  if (data?.user) {
    return data;
  }

  if (!data || typeof data !== 'object' || typeof data.id !== 'string') {
    return data;
  }

  const payload = decodeJwtPayload(authHeader);
  if (!payload) {
    return data;
  }

  const email = typeof payload.email === 'string' ? payload.email : '';
  const workspaceId = typeof payload.workspaceId === 'string' ? payload.workspaceId : data.id;

  return {
    user: {
      id: typeof payload.sub === 'string' ? payload.sub : '',
      email,
      name:
        typeof payload.name === 'string' && payload.name.trim().length
          ? payload.name
          : email.split('@')[0] || 'User',
      workspaceId,
      role: typeof payload.role === 'string' ? payload.role : undefined,
    },
    workspaces: [
      {
        id: data.id,
        name: typeof data.name === 'string' ? data.name : 'Workspace',
      },
    ],
    workspace: data,
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
