import { NextRequest } from "next/server";
import { proxyWhatsAppStream } from "../proxy";

export async function GET(request: NextRequest) {
  try {
    return await proxyWhatsAppStream(request, "/whatsapp-api/live");
  } catch (error) {
    console.error("[WhatsApp Proxy] live stream error:", error);
    return new Response(
      "event: error\ndata: {\"message\":\"Falha ao conectar o painel live do WhatsApp.\"}\n\n",
      {
        status: 502,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }
}
