export type KloelHostKind = 'marketing' | 'auth' | 'app' | 'pay' | 'unknown';
export type KloelHostTarget = Exclude<KloelHostKind, 'unknown'>;

const PROD_ROOT_DOMAIN = 'kloel.com';
const AUTH_PATH_PREFIXES = [
  '/login',
  '/register',
  '/reset-password',
  '/verify-email',
  '/onboarding',
  '/onboarding-chat',
  '/auth/apple/callback',
];
const MARKETING_PATH_PREFIXES = ['/', '/terms', '/privacy', '/cookies'];
const APP_PATH_PREFIXES = [
  '/dashboard',
  '/account',
  '/analytics',
  '/products',
  '/produtos',
  '/marketing',
  '/campaigns',
  '/flow',
  '/funnels',
  '/whatsapp',
  '/webinarios',
  '/sites',
  '/canvas',
  '/leads',
  '/vendas',
  '/sales',
  '/carteira',
  '/billing',
  '/payments',
  '/pricing',
  '/metrics',
  '/parcerias',
  '/anuncios',
  '/ferramentas',
  '/autopilot',
  '/tools',
  '/inbox',
  '/followups',
  '/video',
  '/cia',
  '/scrapers',
  '/settings',
  '/chat',
  '/checkout',
];
const STATIC_FILE_PATTERN =
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|map|txt|xml)$/i;
const CHECKOUT_ENTRY_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type HostParts = {
  hostname: string;
  port: string;
  host: string;
};

function parseHost(rawHost?: string | null): HostParts {
  const host = String(rawHost || '')
    .trim()
    .toLowerCase();
  if (!host) {
    return { hostname: '', port: '', host: '' };
  }

  const [hostname, port = ''] = host.split(':');
  return { hostname, port, host };
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.127.0.0.1')
  );
}

function localRootHost(hostname: string): string {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }

  const [, ...rest] = hostname.split('.');
  const rootHost = rest.join('.') || 'localhost';
  return rootHost === '127.0.0.1' ? 'localhost' : rootHost;
}

function localSubdomainHost(target: KloelHostTarget, hostname: string, port: string): string {
  const rootHost = localRootHost(hostname);
  const prefix = target === 'marketing' ? '' : `${target}.`;
  return `${prefix}${rootHost}${port ? `:${port}` : ''}`;
}

function withPath(base: string, path = '/'): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, base);
  return url.toString();
}

export function normalizeAppPath(path = '/'): string {
  const value = String(path || '/').trim() || '/';

  if (value === '/dashboard') {
    return '/';
  }

  if (value.startsWith('/dashboard?') || value.startsWith('/dashboard#')) {
    return `/${value.slice('/dashboard'.length)}`;
  }

  if (value.startsWith('/dashboard/')) {
    return value.slice('/dashboard'.length) || '/';
  }

  return value;
}

function envOrigin(target: KloelHostTarget): string | null {
  const envMap: Record<KloelHostTarget, string | undefined> = {
    marketing: process.env.NEXT_PUBLIC_SITE_URL,
    auth: process.env.NEXT_PUBLIC_AUTH_URL,
    app: process.env.NEXT_PUBLIC_APP_URL,
    pay: process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN,
  };

  const value = envMap[target]?.trim();
  return value ? value.replace(/\/+$/, '') : null;
}

export function detectKloelHost(host?: string | null): KloelHostKind {
  const { hostname } = parseHost(host);

  if (!hostname) return 'unknown';

  if (hostname === PROD_ROOT_DOMAIN || hostname === `www.${PROD_ROOT_DOMAIN}`) {
    return 'marketing';
  }
  if (hostname === `auth.${PROD_ROOT_DOMAIN}`) return 'auth';
  if (hostname === `app.${PROD_ROOT_DOMAIN}`) return 'app';
  if (hostname === `pay.${PROD_ROOT_DOMAIN}`) return 'pay';

  if (isLocalHostname(hostname)) {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'kloel.localhost') {
      return 'marketing';
    }
    if (hostname.startsWith('auth.')) return 'auth';
    if (hostname.startsWith('app.')) return 'app';
    if (hostname.startsWith('pay.')) return 'pay';
  }

  return 'unknown';
}

export function getSharedCookieDomain(host?: string | null): string | undefined {
  const { hostname } = parseHost(host);
  if (hostname === PROD_ROOT_DOMAIN || hostname.endsWith(`.${PROD_ROOT_DOMAIN}`)) {
    return `.${PROD_ROOT_DOMAIN}`;
  }
  if (hostname.endsWith('.localhost')) {
    const rootHost = localRootHost(hostname);
    if (rootHost && rootHost !== 'localhost' && rootHost.includes('.')) {
      return `.${rootHost}`;
    }
  }
  return undefined;
}

export function buildHostTargetUrl(
  target: KloelHostTarget,
  path = '/',
  currentHost?: string | null,
): string {
  const { hostname, port } = parseHost(currentHost);

  if (isLocalHostname(hostname)) {
    return withPath(`http://${localSubdomainHost(target, hostname || 'localhost', port)}`, path);
  }

  const env = envOrigin(target);
  if (env) {
    return withPath(env, path);
  }

  const prodHost = target === 'marketing' ? PROD_ROOT_DOMAIN : `${target}.${PROD_ROOT_DOMAIN}`;
  return withPath(`https://${prodHost}`, path);
}

export function buildMarketingUrl(path = '/', currentHost?: string | null): string {
  return buildHostTargetUrl('marketing', path, currentHost);
}

export function buildAuthUrl(path = '/login', currentHost?: string | null): string {
  return buildHostTargetUrl('auth', path, currentHost);
}

export function buildAppUrl(path = '/', currentHost?: string | null): string {
  return buildHostTargetUrl('app', normalizeAppPath(path), currentHost);
}

export function buildPayUrl(path = '/', currentHost?: string | null): string {
  return buildHostTargetUrl('pay', path, currentHost);
}

export function sanitizeNextPath(rawValue?: string | null, fallback = '/'): string {
  const value = String(rawValue || '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  if (isAuthPath(value)) {
    return fallback;
  }

  return normalizeAppPath(value);
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATH_PREFIXES.some((prefix) =>
    prefix === '/'
      ? pathname === '/'
      : pathname === prefix ||
        pathname.startsWith(`${prefix}/`) ||
        pathname.startsWith(`${prefix}?`),
  );
}

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATH_PREFIXES.some((prefix) =>
    prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}?`),
  );
}

export function isKnownAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isStaticOrApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/e2e') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/icon') ||
    STATIC_FILE_PATTERN.test(pathname)
  );
}

export function isValidCheckoutCode(candidate: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(candidate);
}

export function isValidCheckoutEntrySegment(candidate: string): boolean {
  const value = String(candidate || '').trim();
  return Boolean(value) && !value.includes('.') && CHECKOUT_ENTRY_SEGMENT_PATTERN.test(value);
}
