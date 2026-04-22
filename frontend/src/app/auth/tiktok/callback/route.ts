import { type NextRequest, NextResponse } from 'next/server';

/**
 * Fallback route: alguns hostings reescrevem /api/auth/* para /auth/*.
 * Esta rota captura /auth/tiktok/callback e reescreve para o path correto.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = url.searchParams.toString();
  const correctPath = `/api/auth/callback/tiktok${searchParams ? `?${searchParams}` : ''}`;
  return NextResponse.rewrite(new URL(correctPath, request.url));
}
