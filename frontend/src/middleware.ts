import { NextRequest, NextResponse } from "next/server";

export function middleware(_request: NextRequest) {
  // www → non-www redirect should be handled at DNS/CDN level (Railway custom domain),
  // not in middleware, to avoid redirect loops when both domains resolve to the same service.
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
