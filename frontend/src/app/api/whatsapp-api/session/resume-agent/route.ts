import { NextRequest, NextResponse } from "next/server";
import { proxyWhatsAppRequest } from "../../proxy";

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(
      request,
      "POST",
      "/whatsapp-api/session/resume-agent",
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("[WhatsApp Proxy] resume agent error:", error);
    return NextResponse.json(
      { message: "Falha ao devolver a sessão ao agente." },
      { status: 502 },
    );
  }
}
