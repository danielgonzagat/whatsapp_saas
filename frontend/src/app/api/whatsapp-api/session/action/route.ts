import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/action');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] session action error:', error);
    return NextResponse.json(
      { message: 'Falha ao executar ação no viewer do WhatsApp.' },
      { status: 502 },
    );
  }
}
