import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/pause-agent');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] pause agent error:', error);
    return NextResponse.json(
      { message: 'Falha ao pausar ou retomar o agente do WhatsApp.' },
      { status: 502 },
    );
  }
}
