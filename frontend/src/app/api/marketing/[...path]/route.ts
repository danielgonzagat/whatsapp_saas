import { findFirstSequential } from '@/lib/async-sequence';
import { type NextRequest, NextResponse } from 'next/server';

import { getBackendCandidateUrls } from '../../_lib/backend-url';

function readCookieValue(request: NextRequest, name: string) {
  return request.cookies.get(name)?.value || '';
}

function isAuthRedirectLike(value: string) {
  const normalized = String(value || '').toLowerCase();
  return (
    normalized.includes('auth.kloel.com/login') ||
    normalized.includes('forceauth=1') ||
    normalized.includes('<html') ||
    normalized.includes('<!doctype html')
  );
}

function firstCookieBearer(
  request: NextRequest,
  cookieNames: string[],
): string | null {
  for (const cookieName of cookieNames) {
    const value = readCookieValue(request, cookieName);
    if (value) return `Bearer ${value}`;
  }
  return null;
}

function bearerFromHeaderOrCookie(
  request: NextRequest,
  headerName: string,
  cookieNames: string[],
): string | null {
  const headerValue = request.headers.get(headerName);
  if (headerValue) return `Bearer ${headerValue}`;
  return firstCookieBearer(request, cookieNames);
}

const ACCESS_TOKEN_COOKIE_NAMES = ['kloel_access_token', 'kloel_token'];

function resolveAuthorizationHeader(request: NextRequest): string | null {
  return (
    request.headers.get('authorization') ||
    bearerFromHeaderOrCookie(
      request,
      'x-kloel-access-token',
      ACCESS_TOKEN_COOKIE_NAMES,
    )
  );
}

function resolveWorkspaceHeader(request: NextRequest): string {
  return (
    request.headers.get('x-workspace-id') ||
    request.headers.get('x-kloel-workspace-id') ||
    readCookieValue(request, 'kloel_workspace_id')
  );
}

function buildHeaders(request: NextRequest, options?: { body?: BodyInit | null }) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const authorization = resolveAuthorizationHeader(request);
  if (authorization) {
    headers.Authorization = authorization;
  }

  const workspaceId = resolveWorkspaceHeader(request);
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }

  if (options?.body) {
    headers['Content-Type'] = request.headers.get('content-type') || 'application/json';
  }

  return headers;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { message: 'Sua sessão expirou. Faça login novamente para continuar no Marketing.' },
    { status: 401 },
  );
}

interface MarketingUpstreamArgs {
  baseUrl: string;
  upstreamPath: string;
  method: string;
  headers: Record<string, string>;
  rawBody: string | undefined;
}

function handleRedirectResponse(
  attempt: Response,
  url: string,
  recordError: (error: unknown) => void,
): NextResponse | null {
  const location = attempt.headers.get('location') || '';
  if (isAuthRedirectLike(location)) {
    return unauthorizedResponse();
  }
  recordError(new Error(`upstream redirect at ${url} -> ${location || 'unknown-location'}`));
  return null;
}

async function handleNonJsonResponse(
  attempt: Response,
  contentType: string,
  recordError: (error: unknown) => void,
): Promise<NextResponse | null> {
  const bodyPreview = (await attempt.text().catch(() => '')).slice(0, 240);
  if (isAuthRedirectLike(`${contentType} ${bodyPreview}`)) {
    return unauthorizedResponse();
  }
  recordError(
    new Error(
      `Unexpected Marketing upstream response (${attempt.status}) content-type=${contentType || 'unknown'} body=${bodyPreview}`,
    ),
  );
  return null;
}

async function interpretMarketingUpstream(
  attempt: Response,
  url: string,
  recordError: (error: unknown) => void,
): Promise<NextResponse | null> {
  if (attempt.status === 404 || attempt.status === 405) {
    recordError(new Error(`upstream ${attempt.status} at ${url}`));
    return null;
  }
  if (attempt.status >= 300 && attempt.status < 400) {
    return handleRedirectResponse(attempt, url, recordError);
  }

  const contentType = attempt.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('application/json')) {
    const data = await attempt.json().catch(() => ({}));
    return NextResponse.json(data, { status: attempt.status });
  }
  return handleNonJsonResponse(attempt, contentType, recordError);
}

async function tryMarketingUpstream(
  args: MarketingUpstreamArgs,
  recordError: (error: unknown) => void,
): Promise<NextResponse | null> {
  const url = `${args.baseUrl}${args.upstreamPath}`;
  try {
    const attempt = await fetch(
      new Request(url, {
        method: args.method,
        headers: args.headers,
        body: args.rawBody || undefined,
        cache: 'no-store',
        redirect: 'manual',
      }),
    );
    return interpretMarketingUpstream(attempt, url, recordError);
  } catch (error) {
    recordError(error);
    return null;
  }
}

async function proxyMarketing(request: NextRequest, pathSegments: string[]) {
  const candidates = getBackendCandidateUrls();
  if (candidates.length === 0) {
    return NextResponse.json(
      { message: 'Servidor backend nao configurado para o proxy de Marketing.' },
      { status: 502 },
    );
  }

  const upstreamPath = `/marketing/${pathSegments.join('/')}${request.nextUrl.search || ''}`;
  const rawBody =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  const headers = buildHeaders(request, { body: rawBody || null });

  let lastError: unknown;
  const recordError = (error: unknown) => {
    lastError = error;
  };

  const response = await findFirstSequential(candidates, (baseUrl) =>
    tryMarketingUpstream(
      { baseUrl, upstreamPath, method: request.method, headers, rawBody },
      recordError,
    ),
  );

  if (response) {
    return response;
  }

  console.error('[Marketing Proxy] all upstreams failed:', lastError);
  return NextResponse.json(
    { message: 'Falha ao conectar com o backend de Marketing.' },
    { status: 502 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyMarketing(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyMarketing(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyMarketing(request, path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyMarketing(request, path);
}
