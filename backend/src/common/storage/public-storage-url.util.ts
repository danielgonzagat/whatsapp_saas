const PATTERN_RE = /\/+$/;

type MinimalRequest = {
  get?: (name: string) => string | undefined;
  headers?: Record<string, string | string[] | undefined>;
  protocol?: string;
};

function pickHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | string[] | undefined {
  return headers[name] ?? headers[name.toLowerCase()];
}

function headerValueToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value || '');
}

function readHeader(req: MinimalRequest, name: string) {
  if (!req) return '';

  if (typeof req.get === 'function') {
    return String(req.get(name) || '');
  }

  const headers = req.headers;
  if (!headers) return '';

  return headerValueToString(pickHeaderValue(headers, name));
}

export function getRequestOrigin(req: MinimalRequest | undefined | null) {
  const forwardedProto = readHeader(req, 'x-forwarded-proto').split(',')[0].trim();
  const forwardedHost = readHeader(req, 'x-forwarded-host').split(',')[0].trim();
  const directHost = readHeader(req, 'host').trim();
  const originHeader = readHeader(req, 'origin').trim();

  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`.replace(PATTERN_RE, '');
  }

  if (directHost) {
    const protocol = forwardedProto || req?.protocol || 'http';
    return `${protocol}://${directHost}`.replace(PATTERN_RE, '');
  }

  if (originHeader) {
    return originHeader.replace(PATTERN_RE, '');
  }

  return '';
}

export function normalizeStorageUrlForRequest(
  rawUrl: string | null | undefined,
  req: MinimalRequest | undefined | null,
) {
  if (!rawUrl) {
    return rawUrl || '';
  }

  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) {
    return rawUrl;
  }

  if (rawUrl.startsWith('/storage/local/') || rawUrl.startsWith('/storage/access/')) {
    return `${requestOrigin}${rawUrl}`;
  }

  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.pathname.startsWith('/storage/local/') ||
      parsed.pathname.startsWith('/storage/access/')
    ) {
      return `${requestOrigin}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}
