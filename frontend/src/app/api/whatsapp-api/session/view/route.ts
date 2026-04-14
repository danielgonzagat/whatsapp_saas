import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function GET(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'GET', '/whatsapp-api/session/view');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] session view error:', error);
    return NextResponse.json(
      { message: 'Falha ao carregar o viewer do WhatsApp.' },
      { status: 502 },
    );
  }
}
