import { type NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from './backend-url';

type ProxyMethod = 'GET' | 'POST' | 'DELETE';

type ProxyOptions = {
  path: string;
  method: ProxyMethod;
  forwardHeaders?: string[];
  bodyMode?: 'text' | 'none';
  timeoutMs?: number;
  errorMessage: string;
};

function readRequestHeader(headers: Headers, name: string) {
  return headers.get(name) || headers.get(name.toLowerCase()) || headers.get(name.toUpperCase());
}

function normalizeHeaderName(name: string) {
  return name
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
}

function buildPassthroughResponse(response: Response) {
  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  const cacheControl = response.headers.get('cache-control');
  if (cacheControl) {
    headers.set('Cache-Control', cacheControl);
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}

export async function proxyPublicBackendRequest(request: NextRequest, options: ProxyOptions) {
  const backendUrl = getBackendUrl();

  if (!backendUrl) {
    return NextResponse.json({ message: 'Servidor não configurado.' }, { status: 503 });
  }

  const upstreamUrl = `${backendUrl}${options.path}${request.nextUrl.search || ''}`;
  const headers = new Headers();

  for (const headerName of options.forwardHeaders || []) {
    const value = readRequestHeader(request.headers, headerName);
    if (value) {
      headers.set(normalizeHeaderName(headerName), value);
    }
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', '*/*');
  }

  try {
    const response = await fetch(upstreamUrl, {
      method: options.method,
      headers,
      body: options.bodyMode === 'text' ? await request.text() : undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs || 15000),
    });

    return buildPassthroughResponse(response);
  } catch (error: unknown) {
    const errorName =
      error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    const isTimeout = errorName === 'TimeoutError' || errorName === 'AbortError';

    return NextResponse.json(
      {
        message: isTimeout ? 'Servidor demorou para responder.' : options.errorMessage,
      },
      { status: 502 },
    );
  }
}
