import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "../../_lib/backend-url";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${getBackendUrl()}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Auth Proxy] login error:", error);
    return NextResponse.json(
      { message: "Falha ao realizar login." },
      { status: 502 },
    );
  }
}