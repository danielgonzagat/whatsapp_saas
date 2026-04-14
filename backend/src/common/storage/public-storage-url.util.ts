const PATTERN_RE = /\/+$/;
function readHeader(req: any, name: string) {
  if (!req) return '';

  if (typeof req.get === 'function') {
    return String(req.get(name) || '');
  }

  const headers = req.headers;
  if (!headers) return '';

  const headerValue = headers[name] ?? headers[name.toLowerCase()];

  if (Array.isArray(headerValue)) {
    return String(headerValue[0] || '');
  }

  return String(headerValue || '');
}

export function getRequestOrigin(req: any) {
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

export function normalizeStorageUrlForRequest(rawUrl: string | null | undefined, req: any) {
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
