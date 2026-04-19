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

function firstListEntry(value: string): string {
  return value.split(',')[0].trim();
}

type OriginComponents = {
  forwardedProto: string;
  forwardedHost: string;
  directHost: string;
  originHeader: string;
  requestProtocol: string;
};

function readOriginComponents(req: MinimalRequest | undefined | null): OriginComponents {
  return {
    forwardedProto: firstListEntry(readHeader(req, 'x-forwarded-proto')),
    forwardedHost: firstListEntry(readHeader(req, 'x-forwarded-host')),
    directHost: readHeader(req, 'host').trim(),
    originHeader: readHeader(req, 'origin').trim(),
    requestProtocol: String(req?.protocol || ''),
  };
}

function buildOriginFromComponents(parts: OriginComponents): string {
  if (parts.forwardedHost) {
    return `${parts.forwardedProto || 'https'}://${parts.forwardedHost}`.replace(PATTERN_RE, '');
  }
  if (parts.directHost) {
    const protocol = parts.forwardedProto || parts.requestProtocol || 'http';
    return `${protocol}://${parts.directHost}`.replace(PATTERN_RE, '');
  }
  if (parts.originHeader) return parts.originHeader.replace(PATTERN_RE, '');
  return '';
}

export function getRequestOrigin(req: MinimalRequest | undefined | null) {
  return buildOriginFromComponents(readOriginComponents(req));
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
