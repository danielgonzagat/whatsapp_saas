import { NextRequest, NextResponse } from 'next/server';

/* ─── pay.kloel.com checkout rewrite ────────────────────────────────────────── */

const PAY_HOSTS = ['pay.kloel.com', 'pay.localhost:3000'];

/* ─── Public paths that don't require authentication ────────────────────────── */

const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/onboarding',
  '/onboarding-chat',
  '/terms',
  '/privacy',
  '/pay/',
  '/api/',
  '/e2e/',
  '/_next/',
  '/favicon',
  '/icon',
];

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const { pathname } = request.nextUrl;

  /* ── pay subdomain rewrite (existing logic) ─────────────────────────────── */
  if (PAY_HOSTS.some((h) => host.startsWith(h))) {
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/favicon') ||
      pathname.includes('.')
    ) {
      return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    if (pathname.startsWith('/order/') || pathname.startsWith('/r/')) {
      url.pathname = pathname;
      return NextResponse.rewrite(url);
    }
    url.pathname = pathname;
    return NextResponse.rewrite(url);
  }

  /* ── Auth guard for protected routes ────────────────────────────────────── */

  // Skip public paths and static assets
  if (
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname === '/' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie (set by login/register API routes and tokenStorage)
  const hasAuth =
    request.cookies.get('kloel_auth')?.value ||
    request.cookies.get('kloel_token')?.value;

  if (!hasAuth) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
};
