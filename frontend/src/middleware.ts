import { hasAuthenticatedKloelToken } from '@/lib/auth-identity';
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
  isValidCheckoutEntrySegment,
  sanitizeNextPath,
} from '@/lib/subdomains';
import { type NextRequest, NextResponse } from 'next/server';

const FORCE_AUTH_QUERY_PARAM = 'forceAuth';
const LEGAL_PATH_PREFIXES = ['/terms', '/privacy', '/data-deletion', '/cookies'];

function hasSharedAuth(request: NextRequest): boolean {
  const accessToken =
    request.cookies.get('kloel_access_token')?.value || request.cookies.get('kloel_token')?.value;

  return hasAuthenticatedKloelToken(accessToken);
}

function currentPath(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  return `${pathname}${search}`;
}

function redirect(url: string) {
  return NextResponse.redirect(url);
}

function isLegalPath(pathname: string): boolean {
  return LEGAL_PATH_PREFIXES.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`),
  );
}

function isPublicAuthPath(pathname: string): boolean {
  return isAuthPath(pathname) || isLegalPath(pathname);
}

function redirectToLogin(_request: NextRequest, host: string, nextPath?: string) {
  const loginUrl = new URL(buildAuthUrl('/login', host));
  loginUrl.searchParams.set(FORCE_AUTH_QUERY_PARAM, '1');

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

  if (segments.length === 1 && isValidCheckoutEntrySegment(segments[0])) {
    return NextResponse.next();
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

function handleForceAuth(request: NextRequest, host: string) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === '/') {
    const loginUrl = new URL(buildAuthUrl('/login', host));
    loginUrl.searchParams.set(FORCE_AUTH_QUERY_PARAM, '1');
    const requestedNext = searchParams.get('next');
    if (requestedNext) {
      loginUrl.searchParams.set('next', sanitizeNextPath(requestedNext));
    }
    return redirect(loginUrl.toString());
  }

  if (isPublicAuthPath(pathname)) {
    return NextResponse.next();
  }

  return null;
}

function handleAuthenticatedOnAuthHost(request: NextRequest, host: string) {
  const targetPath = currentPath(request);
  const { pathname, searchParams } = request.nextUrl;
  const requestedNext = searchParams.get('next');

  const destination = requestedNext
    ? sanitizeNextPath(requestedNext)
    : isKnownAppPath(pathname)
      ? sanitizeNextPath(targetPath)
      : '/';
  return redirect(buildAppUrl(destination, host));
}

function handleAnonymousOnAuthHost(request: NextRequest, host: string) {
  const targetPath = currentPath(request);
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return redirect(buildAuthUrl('/login?forceAuth=1', host));
  }

  if (isPublicAuthPath(pathname)) {
    return NextResponse.next();
  }

  if (isKnownAppPath(pathname)) {
    return redirectToLogin(request, host, targetPath);
  }

  return redirect(buildAuthUrl('/login?forceAuth=1', host));
}

function handleAuthHost(request: NextRequest, host: string, isAuthenticated: boolean) {
  const { searchParams } = request.nextUrl;
  const forceAuth = searchParams.get(FORCE_AUTH_QUERY_PARAM) === '1';

  if (forceAuth) {
    const forced = handleForceAuth(request, host);
    if (forced) {
      return forced;
    }
  }

  if (isAuthenticated) {
    return handleAuthenticatedOnAuthHost(request, host);
  }

  return handleAnonymousOnAuthHost(request, host);
}

function handleAppHost(request: NextRequest, host: string, isAuthenticated: boolean) {
  const targetPath = currentPath(request);
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    if (!isAuthenticated) {
      return redirectToLogin(request, host, '/');
    }

    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = '/chat';
    return NextResponse.rewrite(rewrittenUrl);
  }

  if (pathname === '/auth/impersonate') {
    return NextResponse.next();
  }

  if (pathname === '/dashboard') {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    return redirectToLogin(request, host, targetPath);
  }

  if (isKnownAppPath(pathname)) {
    return NextResponse.next();
  }

  if (isLegalPath(pathname)) {
    return redirect(buildMarketingUrl(targetPath, host));
  }

  return redirect(buildAppUrl('/', host));
}

function handleUnknownHost(request: NextRequest, isAuthenticated: boolean) {
  const { pathname } = request.nextUrl;

  if (pathname === '/' || isPublicAuthPath(pathname)) {
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
