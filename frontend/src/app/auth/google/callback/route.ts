import { NextRequest, NextResponse } from "next/server";

/**
 * Fallback route: alguns hostings (Railway, nginx mal configurado) reescrevem
 * /api/auth/* para /auth/*, quebrando o callback do Google OAuth.
 *
 * Esta rota captura /auth/google/callback e redireciona para
 * /api/auth/callback/google com todos os query params (code, state, etc.).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();

  // Monta a URL correta do NextAuth
  const correctPath = `/api/auth/callback/google${searchParams ? `?${searchParams}` : ""}`;

  // Redireciona preservando o host
  return NextResponse.redirect(new URL(correctPath, request.url));
}
