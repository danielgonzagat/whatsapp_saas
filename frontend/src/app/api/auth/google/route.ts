// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getBackendUrl } from "../../_lib/backend-url";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      console.error("[Auth Proxy] google: BACKEND_URL not configured");
      return NextResponse.json(
        { message: "Servidor não configurado." },
        { status: 503 },
      );
    }

    const response = await fetch(`${backendUrl}/auth/oauth/google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));
    revalidateTag("auth", "max");
    const res = NextResponse.json(data, { status: response.status });

    if (response.ok && data.access_token) {
      res.cookies.set('kloel_auth', '1', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
    }

    return res;
  } catch (error: any) {
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("[Auth Proxy] google oauth error:", isTimeout ? "Request timed out (15s)" : error);
    return NextResponse.json(
      { message: isTimeout ? "Servidor demorou para responder. Tente novamente." : "Falha ao autenticar com Google." },
      { status: 502 },
    );
  }
}
