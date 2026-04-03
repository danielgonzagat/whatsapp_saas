import { getRequestOrigin } from '../common/storage/public-storage-url.util';

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
      return url.toString().replace(/\/+$/, '');
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      url.hostname = `pay.${hostname}`;
      return url.toString().replace(/\/+$/, '');
    }

    if (hostname.endsWith('.localhost') || hostname.endsWith('.127.0.0.1')) {
      const [, ...rest] = hostname.split('.');
      const rootHost = rest.join('.') || 'localhost';
      url.hostname = `pay.${rootHost}`;
      return url.toString().replace(/\/+$/, '');
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolvePayOrigin(req?: any) {
  return (
    normalizePayOrigin(process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN) ||
    normalizePayOrigin(process.env.CHECKOUT_DOMAIN) ||
    normalizePayOrigin(process.env.FRONTEND_URL) ||
    normalizePayOrigin(getRequestOrigin(req)) ||
    'https://pay.kloel.com'
  );
}

export function buildPayCheckoutUrl(req: any, code: string | null | undefined) {
  if (!code) return null;
  return `${resolvePayOrigin(req)}/${String(code).trim().toUpperCase()}`;
}
