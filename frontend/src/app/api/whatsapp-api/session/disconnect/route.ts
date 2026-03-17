import { NextRequest, NextResponse } from "next/server";

function getBackendUrl() {
  return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
}

export async function DELETE(request: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      return NextResponse.json(
        { message: "Servidor não configurado corretamente." },
        { status: 500 },
      );
    }

    const response = await fetch(`${backendUrl}/whatsapp-api/session/disconnect`, {
      method: "DELETE",
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
    console.error("[WhatsApp Proxy] disconnect error:", error);
    return NextResponse.json(
      { message: "Falha ao desconectar WhatsApp." },
      { status: 502 },
    );
  }
}