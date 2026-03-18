import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "../../api/_lib/backend-url";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${getBackendUrl()}/workspace/me`, {
      method: "GET",
      headers: {
        Authorization: request.headers.get("authorization") || "",
        "x-workspace-id": request.headers.get("x-workspace-id") || "",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Workspace Proxy] me error:", error);
    return NextResponse.json(
      { message: "Falha ao carregar workspace." },
      { status: 502 },
    );
  }
}