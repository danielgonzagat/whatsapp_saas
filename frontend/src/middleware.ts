import { NextRequest, NextResponse } from 'next/server';

/* ─── pay.kloel.com middleware ─────────────────────────────────────────────── */

const PAY_HOSTS = ['pay.kloel.com', 'pay.localhost:3000'];

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  // Only rewrite for the pay subdomain
  if (!PAY_HOSTS.some((h) => host.startsWith(h))) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Rewrite pay.kloel.com/meu-produto -> /(checkout)/meu-produto
  // The (checkout) route group handles slug-based checkout pages
  const url = request.nextUrl.clone();

  // If the path is /order/xxx, rewrite to the checkout order route
  if (pathname.startsWith('/order/')) {
    url.pathname = pathname; // Already handled by (checkout)/order/[orderId]
    return NextResponse.rewrite(url);
  }

  // If the path is /r/xxx, rewrite to the checkout referral route
  if (pathname.startsWith('/r/')) {
    url.pathname = pathname; // Already handled by (checkout)/r/[code]
    return NextResponse.rewrite(url);
  }

  // Default: treat as a checkout slug
  // pay.kloel.com/meu-produto -> serves /(checkout)/[slug]/page.tsx
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image, _next/data
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|_next/data|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
