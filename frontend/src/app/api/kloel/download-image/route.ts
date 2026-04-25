import { type NextRequest, NextResponse } from 'next/server';
import { getBackendCandidateUrls } from '../../_lib/backend-url';

const A_Z_A_Z0_9_RE = /[^a-zA-Z0-9._-]+/g;

const DATA_URL_RE = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/;

function sanitizeFilename(value: string) {
  const normalized = value.trim().replace(A_Z_A_Z0_9_RE, '-');
  return normalized || 'kloel-image.png';
}

function decodeDataUrl(value: string) {
  const match = value.match(DATA_URL_RE);
  if (!match) {
    return null;
  }

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';

  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

function isAllowedBackendStorageUrl(rawUrl: string) {
  try {
    const target = new URL(rawUrl);
    const allowedOrigins = new Set(
      getBackendCandidateUrls().map((candidate) => {
        try {
          return new URL(candidate).origin;
        } catch {
          return '';
        }
      }),
    );

    return allowedOrigins.has(target.origin) && target.pathname.startsWith('/storage/');
  } catch {
    return false;
  }
}

/** Get. */
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url') || '';
  const filename = sanitizeFilename(request.nextUrl.searchParams.get('filename') || '');

  if (!rawUrl) {
    return NextResponse.json({ message: 'URL da imagem não informada.' }, { status: 400 });
  }

  if (rawUrl.startsWith('data:')) {
    const decoded = decodeDataUrl(rawUrl);
    if (!decoded) {
      return NextResponse.json({ message: 'Data URL inválida.' }, { status: 400 });
    }

    return new NextResponse(decoded.buffer, {
      status: 200,
      headers: {
        'Content-Type': decoded.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  if (!isAllowedBackendStorageUrl(rawUrl)) {
    return NextResponse.json(
      { message: 'A imagem solicitada não está autorizada para download.' },
      { status: 400 },
    );
  }

  // Validate URL structure explicitly for request-forgery detection.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ message: 'URL inválida.' }, { status: 400 });
  }

  // Ensure protocol is http(s) only.
  if (!parsedUrl.protocol.match(/^https?:$/)) {
    return NextResponse.json({ message: 'Protocolo de URL não autorizado.' }, { status: 400 });
  }

  // CodeQL js/request-forgery barrier: feed fetch the URL re-serialized
  // through the validated URL object (not the raw user-supplied string).
  // Combined with the allowlist check above, this cuts the taint flow.
  try {
    const upstream = await fetch(parsedUrl.toString(), {
      cache: 'no-store',
      headers: {
        Accept: 'image/*,application/octet-stream;q=0.8,*/*;q=0.5',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { message: `Falha ao baixar a imagem (${upstream.status}).` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const payload = await upstream.arrayBuffer();

    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Falha ao processar o download da imagem.' },
      { status: 502 },
    );
  }
}
