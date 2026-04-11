import { NextRequest, NextResponse } from 'next/server';

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

function buildHeaders(request: NextRequest, options?: { body?: BodyInit | null }) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const authorization =
    request.headers.get('authorization') ||
    (request.headers.get('x-kloel-access-token')
      ? `Bearer ${request.headers.get('x-kloel-access-token')}`
      : readCookieValue(request, 'kloel_access_token')
        ? `Bearer ${readCookieValue(request, 'kloel_access_token')}`
        : readCookieValue(request, 'kloel_token')
          ? `Bearer ${readCookieValue(request, 'kloel_token')}`
          : null);
  const workspaceId =
    request.headers.get('x-workspace-id') ||
    request.headers.get('x-kloel-workspace-id') ||
    readCookieValue(request, 'kloel_workspace_id');

  if (authorization) {
    headers.Authorization = authorization;
  }

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

async function proxyMarketing(request: NextRequest, pathSegments: string[]) {
  const upstreamPath = `/marketing/${pathSegments.join('/')}${request.nextUrl.search || ''}`;
  const rawBody =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  const headers = buildHeaders(request, {
    body: rawBody || null,
  });
  const candidates = getBackendCandidateUrls();

  if (candidates.length === 0) {
    return NextResponse.json(
      { message: 'Servidor backend nao configurado para o proxy de Marketing.' },
      { status: 502 },
    );
  }

  let lastError: unknown;

  for (const baseUrl of candidates) {
    const url = `${baseUrl}${upstreamPath}`;

    try {
      const response = await fetch(url, {
        method: request.method,
        headers,
        body: rawBody || undefined,
        cache: 'no-store',
        redirect: 'manual',
      });

      if (response.status === 404 || response.status === 405) {
        lastError = new Error(`upstream ${response.status} at ${url}`);
        continue;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location') || '';
        if (isAuthRedirectLike(location)) {
          return unauthorizedResponse();
        }
        lastError = new Error(`upstream redirect at ${url} -> ${location || 'unknown-location'}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().includes('application/json')) {
        const data = await response.json().catch(() => ({}));
        return NextResponse.json(data, { status: response.status });
      }

      const bodyPreview = (await response.text().catch(() => '')).slice(0, 240);
      if (isAuthRedirectLike(`${contentType} ${bodyPreview}`)) {
        return unauthorizedResponse();
      }

      lastError = new Error(
        `Unexpected Marketing upstream response (${response.status}) content-type=${contentType || 'unknown'} body=${bodyPreview}`,
      );
    } catch (error) {
      lastError = error;
    }
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
