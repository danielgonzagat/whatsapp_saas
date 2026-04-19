import { getRequestOrigin } from '../common/storage/public-storage-url.util';

const PATTERN_RE = /\/+$/;

const KLOEL_HOSTNAMES = new Set(['kloel.com', 'www.kloel.com', 'app.kloel.com', 'auth.kloel.com']);

const LOCAL_ROOTS = new Set(['localhost', '127.0.0.1']);

function resolvePayHostname(hostname: string): string | null {
  if (KLOEL_HOSTNAMES.has(hostname)) return 'pay.kloel.com';
  if (LOCAL_ROOTS.has(hostname)) return `pay.${hostname}`;
  if (hostname.endsWith('.localhost') || hostname.endsWith('.127.0.0.1')) {
    const [, ...rest] = hostname.split('.');
    const rootHost = rest.join('.') || 'localhost';
    return `pay.${rootHost}`;
  }
  return null;
}

function normalizePayOrigin(candidate?: string | null) {
  const raw = String(candidate || '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const remapped = resolvePayHostname(hostname);
    if (remapped) {
      url.hostname = remapped;
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
