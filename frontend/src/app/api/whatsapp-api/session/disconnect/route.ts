import { NextRequest, NextResponse } from "next/server";
import { proxyWhatsAppRequest } from "../../proxy";

export async function DELETE(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(
      request,
      "DELETE",
      "/whatsapp-api/session/disconnect",
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("[WhatsApp Proxy] disconnect error:", error);
    return NextResponse.json(
      { message: "Falha ao desconectar WhatsApp." },
      { status: 502 },
    );
  }
}