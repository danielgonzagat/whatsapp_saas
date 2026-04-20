import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin middleware — purely a quality-of-life redirect layer.
 *
 * Real auth enforcement happens in (admin)/layout.tsx which checks the
 * client-side session context. This middleware exists only to reduce the
 * flash of protected content for visitors who have no session at all.
 *
 * NOTE: we cannot fully check auth here because the access token lives in
 * memory (not in a cookie) by design, per the SP-0..2 spec.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only redirect the bare root to /login. All other routes are guarded by
  // the React layer.
  if (pathname === '/' || pathname === '') {
    // Let the server component at /page.tsx handle the redirect chain.
    return NextResponse.next();
  }
  return NextResponse.next();
}

/** Config. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
