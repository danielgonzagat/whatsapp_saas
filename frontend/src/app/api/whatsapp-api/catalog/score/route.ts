import { NextRequest, NextResponse } from "next/server";
import { proxyWhatsAppRequest } from "../../proxy";

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(
      request,
      "POST",
      "/whatsapp-api/catalog/score",
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("[WhatsApp Proxy] catalog/score error:", error);
    return NextResponse.json(
      { message: "Falha ao pontuar contatos do catálogo." },
      { status: 502 },
    );
  }
}
