import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";

  // Canonical domain redirect: www.kloel.com → kloel.com
  // Must happen in middleware (not next.config redirects) so the browser
  // redirects BEFORE making any fetch/XHR calls that would fail CORS.
  if (host.startsWith("www.")) {
    const canonical = host.replace(/^www\./, "");
    const url = request.nextUrl.clone();
    url.host = canonical;
    url.protocol = "https";
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
