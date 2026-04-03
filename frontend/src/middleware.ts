import { NextRequest, NextResponse } from 'next/server';
import {
  buildAppUrl,
  buildAuthUrl,
  buildMarketingUrl,
  detectKloelHost,
  isAuthPath,
  isKnownAppPath,
  isMarketingPath,
  isStaticOrApiPath,
  isValidCheckoutCode,
  sanitizeNextPath,
} from '@/lib/subdomains';

const AUTH_COOKIE_NAMES = ['kloel_auth', 'kloel_access_token', 'kloel_token'] as const;

function hasSharedAuth(request: NextRequest): boolean {
  return AUTH_COOKIE_NAMES.some((name) => Boolean(request.cookies.get(name)?.value));
}

function currentPath(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  return `${pathname}${search}`;
}

function redirect(url: string) {
  return NextResponse.redirect(url);
}

function isMercadoPagoNotificationRootRequest(request: NextRequest) {
  if (request.method !== 'POST') {
    return false;
  }

  if (request.nextUrl.pathname !== '/') {
    return false;
  }

  const hasTopic =
    request.nextUrl.searchParams.has('topic') || request.nextUrl.searchParams.has('type');
  const hasResourceId =
    request.nextUrl.searchParams.has('id') || request.nextUrl.searchParams.has('data.id');
  const hasWebhookSignature =
    request.headers.has('x-signature') || request.headers.has('x-request-id');

  return (hasTopic && hasResourceId) || hasWebhookSignature;
}

function redirectToLogin(request: NextRequest, host: string, nextPath?: string) {
  const loginUrl = new URL(buildAuthUrl('/login', host));

  if (nextPath) {
    loginUrl.searchParams.set('next', sanitizeNextPath(nextPath));
  }

  return redirect(loginUrl.toString());
}

function handlePayHost(request: NextRequest, host: string) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return redirect(buildMarketingUrl('/', host));
  }

  if (pathname.startsWith('/order/') || pathname.startsWith('/r/')) {
    return NextResponse.next();
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 1 && isValidCheckoutCode(segments[0])) {
    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = `/r/${segments[0]}`;
    return NextResponse.rewrite(rewrittenUrl);
  }

  return redirect(buildMarketingUrl('/', host));
}

function handleMarketingHost(request: NextRequest, host: string, isAuthenticated: boolean) {
  const targetPath = currentPath(request);
  const { pathname } = request.nextUrl;

  if (isMarketingPath(pathname)) {
    return NextResponse.next();
  }

  if (isAuthPath(pathname)) {
    return redirect(buildAuthUrl(targetPath, host));
  }

  if (isKnownAppPath(pathname)) {
    return isAuthenticated
      ? redirect(buildAppUrl(targetPath, host))
      : redirectToLogin(request, host, targetPath);
  }

  return redirect(buildMarketingUrl('/', host));
}

function handleAuthHost(request: NextRequest, host: string, isAuthenticated: boolean) {
  const targetPath = currentPath(request);
  const { pathname, searchParams } = request.nextUrl;

  if (isAuthenticated) {
    const requestedNext = searchParams.get('next');
    const destination = requestedNext
      ? sanitizeNextPath(requestedNext)
      : isKnownAppPath(pathname)
        ? sanitizeNextPath(targetPath)
        : '/dashboard';
    return redirect(buildAppUrl(destination, host));
  }

  if (pathname === '/') {
    return redirect(buildAuthUrl('/login', host));
  }

  if (isAuthPath(pathname) || pathname === '/terms' || pathname === '/privacy') {
    return NextResponse.next();
  }

  if (isKnownAppPath(pathname)) {
    return redirectToLogin(request, host, targetPath);
  }

  return redirect(buildAuthUrl('/login', host));
}

function handleAppHost(request: NextRequest, host: string, isAuthenticated: boolean) {
  const targetPath = currentPath(request);
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return redirect(buildAppUrl('/dashboard', host));
  }

  if (!isAuthenticated) {
    return redirectToLogin(request, host, targetPath);
  }

  if (isKnownAppPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === '/terms' || pathname === '/privacy') {
    return redirect(buildMarketingUrl(targetPath, host));
  }

  return redirect(buildAppUrl('/dashboard', host));
}

function handleUnknownHost(request: NextRequest, isAuthenticated: boolean) {
  const { pathname } = request.nextUrl;

  if (
    pathname === '/' ||
    isAuthPath(pathname) ||
    pathname === '/terms' ||
    pathname === '/privacy'
  ) {
    return NextResponse.next();
  }

  if (!isAuthenticated && isKnownAppPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', sanitizeNextPath(currentPath(request)));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || request.nextUrl.host || '';
  const { pathname } = request.nextUrl;

  if (isMercadoPagoNotificationRootRequest(request)) {
    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = '/api/mercado-pago/ipn';
    return NextResponse.rewrite(rewrittenUrl);
  }

  if (isStaticOrApiPath(pathname)) {
    return NextResponse.next();
  }

  const hostKind = detectKloelHost(host);
  const isAuthenticated = hasSharedAuth(request);

  switch (hostKind) {
    case 'pay':
      return handlePayHost(request, host);
    case 'marketing':
      return handleMarketingHost(request, host, isAuthenticated);
    case 'auth':
      return handleAuthHost(request, host, isAuthenticated);
    case 'app':
      return handleAppHost(request, host, isAuthenticated);
    default:
      return handleUnknownHost(request, isAuthenticated);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
};
