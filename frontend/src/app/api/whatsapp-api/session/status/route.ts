import { NextRequest, NextResponse } from "next/server";
import { proxyWhatsAppRequest } from "../../proxy";

export async function GET(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(
      request,
      "GET",
      "/whatsapp-api/session/status",
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("[WhatsApp Proxy] status error:", error);
    return NextResponse.json(
      { message: "Falha ao consultar status do WhatsApp." },
      { status: 502 },
    );
  }
}