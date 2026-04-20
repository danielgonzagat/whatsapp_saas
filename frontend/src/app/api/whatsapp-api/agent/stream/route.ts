import type { NextRequest } from 'next/server';
import { proxyWhatsAppStream } from '../../proxy';

/** Get. */
export async function GET(request: NextRequest) {
  try {
    return await proxyWhatsAppStream(request, '/whatsapp-api/agent/stream');
  } catch (error) {
    console.error('[WhatsApp Proxy] agent stream error:', error);
    return new Response(
      'event: error\ndata: {"message":"Falha ao conectar o stream da CIA."}\n\n',
      {
        status: 502,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      },
    );
  }
}
