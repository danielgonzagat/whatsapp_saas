import { NextRequest, NextResponse } from "next/server";

/**
 * Fallback route: alguns hostings reescrevem /api/auth/* para /auth/*.
 * Esta rota captura /auth/apple/callback e redireciona para o path correto.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();

  const correctPath = `/api/auth/callback/apple${searchParams ? `?${searchParams}` : ""}`;

  return NextResponse.redirect(new URL(correctPath, request.url));
}

// Apple também pode usar POST para o callback
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();

  const correctPath = `/api/auth/callback/apple${searchParams ? `?${searchParams}` : ""}`;

  return NextResponse.redirect(new URL(correctPath, request.url));
}
