// PULSE:OK — server-side proxy route, SWR cache managed by client-side callers
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getBackendCandidateUrls } from "../../../_lib/backend-url";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let lastError: unknown;

    for (const baseUrl of getBackendCandidateUrls()) {
      const response = await fetch(`${baseUrl}/auth/whatsapp/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!response) continue;
      if (response.status === 404 || response.status === 405) {
        lastError = new Error(`upstream ${response.status} at ${baseUrl}/auth/whatsapp/verify`);
        continue;
      }

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
    }

    throw lastError || new Error("Unable to reach WhatsApp verify endpoint");
  } catch (error) {
    console.error("[Auth Proxy] whatsapp verify error:", error);
    return NextResponse.json(
      { message: "Erro ao verificar código" },
      { status: 502 },
    );
  }
}
