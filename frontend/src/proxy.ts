import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rotas que requerem autenticação
const protectedRoutes = [
  "/account",
  "/analytics",
  "/autopilot",
  "/billing",
  "/campaigns",
  "/dashboard",
  "/flow",
  "/followups",
  "/funnels",
  "/inbox",
  "/leads",
  "/metrics",
  "/payments",
  "/products",
  "/sales",
  "/settings",
  "/tools",
  "/whatsapp",
];

// Rotas públicas (não requerem autenticação)
const publicRoutes = ["/", "/login", "/register", "/forgot-password"];

export default auth((req) => {
  const { nextUrl } = req;
  const session = (req as NextRequest & { auth?: { user?: unknown } | null }).auth;
  const isLoggedIn = !!session?.user;
  const isProtectedRoute = protectedRoutes.some((route) =>
    nextUrl.pathname.startsWith(route)
  );
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);

  // Se é uma rota protegida e o usuário não está logado
  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Se o usuário está logado e tenta acessar login/register
  if (isLoggedIn && (nextUrl.pathname === "/login" || nextUrl.pathname === "/register")) {
    return NextResponse.redirect(new URL("/", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};