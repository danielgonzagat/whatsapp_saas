import { findFirstSequential } from '@/lib/async-sequence';
import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

/**
 * Catch-all proxy for /api/kyc/* -> backend /kyc/*
 * Mirrors the same pattern used by /api/workspace/me and /api/auth/*.
 * This ensures KYC calls go through the same-origin Next.js server,
 * avoiding CORS / NEXT_PUBLIC_API_URL misconfiguration issues.
 */

function resolveWorkspaceIdHeader(request: NextRequest): string {
  return request.headers.get('x-workspace-id') || request.headers.get('x-kloel-workspace-id') || '';
}

function buildKycHeaders(request: NextRequest, isFormData: boolean, contentType: string) {
  const headers: Record<string, string> = {
    Authorization: request.headers.get('authorization') || '',
    'x-workspace-id': resolveWorkspaceIdHeader(request),
    Accept: 'application/json',
  };
  headers['Content-Type'] = isFormData ? contentType : 'application/json';
  return headers;
}

async function readKycRequestBody(
  request: NextRequest,
  isFormData: boolean,
): Promise<BodyInit | null> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return null;
  }
  if (isFormData) {
    return request.arrayBuffer();
  }
  return request.text().catch(() => null);
}

async function buildResponseFromUpstream(attempt: Response) {
  const responseContentType = attempt.headers.get('content-type') || '';
  if (responseContentType.includes('application/json')) {
    const data = await attempt.json().catch(() => ({}));
    return NextResponse.json(data, { status: attempt.status });
  }

  const blob = await attempt.blob();
  return new NextResponse(blob, {
    status: attempt.status,
    headers: { 'Content-Type': responseContentType },
  });
}

interface UpstreamCallArgs {
  baseUrl: string;
  kycPath: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null;
}

async function callUpstreamKyc(
  { baseUrl, kycPath, method, headers, body }: UpstreamCallArgs,
  recordError: (error: unknown) => void,
): Promise<NextResponse | null> {
  const url = `${baseUrl}${kycPath}`;
  const attempt = await fetch(url, {
    method,
    headers,
    body,
    cache: 'no-store',
  }).catch((error) => {
    recordError(error);
    return null;
  });

  if (!attempt) {
    return null;
  }
  if (attempt.status === 404 || attempt.status === 405) {
    recordError(new Error(`upstream ${attempt.status} at ${url}`));
    return null;
  }

  return buildResponseFromUpstream(attempt);
}

async function proxyKyc(request: NextRequest, pathSegments: string[]) {
  const candidates = getBackendCandidateUrls();
  if (candidates.length === 0) {
    console.error(
      '[KYC Proxy] No backend URLs configured. Set BACKEND_URL or NEXT_PUBLIC_API_URL.',
    );
    return NextResponse.json({ message: 'Servidor backend nao configurado.' }, { status: 502 });
  }

  const kycPath = `/kyc/${pathSegments.join('/')}`;
  const contentType = request.headers.get('content-type') || '';
  const isFormData = contentType.includes('multipart/form-data');
  const headers = buildKycHeaders(request, isFormData, contentType);
  const body = await readKycRequestBody(request, isFormData);

  let lastError: unknown;
  const recordError = (error: unknown) => {
    lastError = error;
  };

  const response = await findFirstSequential(candidates, (baseUrl) =>
    callUpstreamKyc({ baseUrl, kycPath, method: request.method, headers, body }, recordError),
  );

  if (response) {
    return response;
  }

  console.error('[KYC Proxy] all backends failed:', lastError);
  return NextResponse.json({ message: 'Falha ao conectar com o servidor.' }, { status: 502 });
}

/** Get. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}

/** Post. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}

/** Put. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}

/** Delete. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}
