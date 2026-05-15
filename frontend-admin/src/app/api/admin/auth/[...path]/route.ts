import { type NextRequest, NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:3001/admin';
const ADMIN_REFRESH_COOKIE = 'kloel_admin_refresh';
const ADMIN_REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

interface UpstreamAuthRequest {
  path: string;
  authorizationToken?: string;
  body?: Record<string, unknown>;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function readRequestBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    return readRecord(await request.json());
  } catch {
    return {};
  }
}

function takeString(record: Record<string, unknown>, key: string): string {
  return readString(record[key]);
}

function copyBodyWithoutKeys(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !blocked.has(key)));
}

function buildCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/admin/auth',
    maxAge,
  };
}

function setRefreshCookie(response: NextResponse, token: string): void {
  response.cookies.set(ADMIN_REFRESH_COOKIE, token, buildCookieOptions(ADMIN_REFRESH_MAX_AGE));
}

function clearRefreshCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_REFRESH_COOKIE, '', buildCookieOptions(0));
}

function sanitizeAuthPayload(payload: unknown): Record<string, unknown> {
  const record = readRecord(payload);
  const { refreshToken: _refreshToken, refresh_token: _refreshTokenAlias, ...safePayload } = record;
  return safePayload;
}

function resolveRefreshToken(payload: unknown): string {
  const record = readRecord(payload);
  return readString(record.refreshToken) || readString(record.refresh_token);
}

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

function unauthorized(message = 'Sessao admin expirada.') {
  const response = NextResponse.json({ message }, { status: 401 });
  clearRefreshCookie(response);
  return response;
}

async function buildUpstreamRequest(
  request: NextRequest,
  pathSegments: string[],
): Promise<UpstreamAuthRequest | NextResponse> {
  const path = pathSegments.join('/');
  const body = await readRequestBody(request);

  switch (path) {
    case 'login':
      return { path: '/auth/login', body };
    case 'change-password': {
      const changeToken = takeString(body, 'changeToken');
      if (!changeToken) {
        return badRequest('Token de troca de senha ausente.');
      }
      return {
        path: '/auth/change-password',
        authorizationToken: changeToken,
        body: copyBodyWithoutKeys(body, ['changeToken']),
      };
    }
    case 'mfa/setup': {
      const setupToken = takeString(body, 'setupToken');
      if (!setupToken) {
        return badRequest('Token de configuracao MFA ausente.');
      }
      return { path: '/auth/mfa/setup', authorizationToken: setupToken };
    }
    case 'mfa/verify-initial': {
      const setupToken = takeString(body, 'setupToken');
      if (!setupToken) {
        return badRequest('Token de configuracao MFA ausente.');
      }
      return {
        path: '/auth/mfa/verify-initial',
        authorizationToken: setupToken,
        body: copyBodyWithoutKeys(body, ['setupToken']),
      };
    }
    case 'mfa/verify': {
      const mfaToken = takeString(body, 'mfaToken');
      if (!mfaToken) {
        return badRequest('Token MFA ausente.');
      }
      return {
        path: '/auth/mfa/verify',
        authorizationToken: mfaToken,
        body: copyBodyWithoutKeys(body, ['mfaToken']),
      };
    }
    case 'refresh': {
      const refreshToken = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value || '';
      if (!refreshToken) {
        return unauthorized();
      }
      return { path: '/auth/refresh', body: { refreshToken } };
    }
    case 'logout': {
      const response = new NextResponse(null, { status: 204 });
      clearRefreshCookie(response);
      return response;
    }
    default:
      return NextResponse.json({ message: 'Rota admin auth nao encontrada.' }, { status: 404 });
  }
}

function buildHeaders(request: NextRequest, upstream: UpstreamAuthRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
    'User-Agent': request.headers.get('user-agent') || 'kloel-admin',
  };
  if (upstream.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (upstream.authorizationToken) {
    headers.Authorization = `Bearer ${upstream.authorizationToken}`;
  }
  return headers;
}

async function callAdminAuthUpstream(request: NextRequest, upstream: UpstreamAuthRequest) {
  const init: RequestInit = {
    method: 'POST',
    headers: buildHeaders(request, upstream),
    cache: 'no-store',
  };
  if (upstream.body !== undefined) {
    init.body = JSON.stringify(upstream.body);
  }
  return fetch(`${ADMIN_API_URL}${upstream.path}`, init);
}

async function buildAuthResponse(upstreamResponse: Response) {
  const text = await upstreamResponse.text();
  const payload = text
    ? ((): unknown => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { message: text };
        }
      })()
    : {};
  const refreshToken = resolveRefreshToken(payload);
  const response = NextResponse.json(sanitizeAuthPayload(payload), {
    status: upstreamResponse.status,
  });

  if (upstreamResponse.ok && refreshToken) {
    setRefreshCookie(response, refreshToken);
  }
  if (upstreamResponse.status === 401) {
    clearRefreshCookie(response);
  }

  return response;
}

/** Post. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const upstream = await buildUpstreamRequest(request, path);
  if (upstream instanceof NextResponse) {
    return upstream;
  }

  try {
    const response = await callAdminAuthUpstream(request, upstream);
    return buildAuthResponse(response);
  } catch {
    return NextResponse.json({ message: 'Falha ao conectar com auth admin.' }, { status: 502 });
  }
}
