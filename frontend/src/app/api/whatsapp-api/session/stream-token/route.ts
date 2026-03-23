import { NextRequest, NextResponse } from "next/server";
import { proxyWhatsAppRequest } from "../../proxy";

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(
      request,
      "POST",
      "/whatsapp-api/session/stream-token",
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("[WhatsApp Proxy] stream-token error:", error);
    return NextResponse.json(
      { message: "Falha ao obter token do screencast." },
      { status: 502 },
    );
  }
}
