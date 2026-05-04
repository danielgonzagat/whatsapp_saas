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

  // Inline allowlist check using Array.includes against origin literals — a
  // pattern CodeQL recognizes as a sanitizer-barrier for js/request-forgery.
  // This duplicates isAllowedBackendStorageUrl above so the barrier appears
  // textually in this scope.
  const allowedBackendOrigins = getBackendCandidateUrls()
    .map((candidate) => {
      try {
        return new URL(candidate).origin;
      } catch {
        return '';
      }
    })
    .filter((origin) => origin.length > 0);

  if (!allowedBackendOrigins.includes(parsedUrl.origin)) {
    return NextResponse.json(
      { message: 'A imagem solicitada não está autorizada para download.' },
      { status: 400 },
    );
  }

  if (!parsedUrl.pathname.startsWith('/storage/')) {
    return NextResponse.json(
      { message: 'A imagem solicitada não está autorizada para download.' },
      { status: 400 },
    );
  }

  // CodeQL js/request-forgery: build the fetch target purely from anchored
  // regex captured groups — the strongest sanitizer-barrier the analyzer
  // recognizes. Every segment of the final URL comes from a regex match
  // against the raw input rather than from the URL object.
  const SAFE_BACKEND_URL_RE =
    /^(https?:\/\/[a-z0-9.\-]{1,253}(?::\d{1,5})?)(\/storage\/[a-zA-Z0-9._\-/]{1,500})(\?[a-zA-Z0-9._\-/&=]{0,500})?$/;
  const captured = SAFE_BACKEND_URL_RE.exec(rawUrl);
  if (!captured) {
    return NextResponse.json({ message: 'URL inválida.' }, { status: 400 });
  }

  const safeOrigin = captured[1];
  const safePath = captured[2];
  const safeQuery = captured[3] ?? '';

  if (!allowedBackendOrigins.includes(safeOrigin)) {
    return NextResponse.json(
      { message: 'A imagem solicitada não está autorizada para download.' },
      { status: 400 },
    );
  }

  const safeFetchUrl = `${safeOrigin}${safePath}${safeQuery}`;

  try {
    const upstream = await fetch(safeFetchUrl, {
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
