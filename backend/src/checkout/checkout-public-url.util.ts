import { getRequestOrigin } from '../common/storage/public-storage-url.util';

const PATTERN_RE = /\/+$/;

function normalizePayOrigin(candidate?: string | null) {
  const raw = String(candidate || '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === 'kloel.com' ||
      hostname === 'www.kloel.com' ||
      hostname === 'app.kloel.com' ||
      hostname === 'auth.kloel.com'
    ) {
      url.hostname = 'pay.kloel.com';
      return url.toString().replace(PATTERN_RE, '');
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      url.hostname = `pay.${hostname}`;
      return url.toString().replace(PATTERN_RE, '');
    }

    if (hostname.endsWith('.localhost') || hostname.endsWith('.127.0.0.1')) {
      const [, ...rest] = hostname.split('.');
      const rootHost = rest.join('.') || 'localhost';
      url.hostname = `pay.${rootHost}`;
      return url.toString().replace(PATTERN_RE, '');
    }

    return url.toString().replace(PATTERN_RE, '');
  } catch {
    return null;
  }
}

export function resolvePayOrigin(
  req?: {
    get?: (name: string) => string | undefined;
    headers?: Record<string, string | string[] | undefined>;
    protocol?: string;
  } | null,
) {
  return (
    normalizePayOrigin(process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN) ||
    normalizePayOrigin(process.env.CHECKOUT_DOMAIN) ||
    normalizePayOrigin(process.env.FRONTEND_URL) ||
    normalizePayOrigin(getRequestOrigin(req)) ||
    'https://pay.kloel.com'
  );
}

export function buildPayCheckoutUrl(
  req:
    | {
        get?: (name: string) => string | undefined;
        headers?: Record<string, string | string[] | undefined>;
        protocol?: string;
      }
    | undefined
    | null,
  code: string | null | undefined,
) {
  if (!code) return null;
  return `${resolvePayOrigin(req)}/${String(code).trim().toUpperCase()}`;
}
