import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function GET(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'GET', '/whatsapp-api/cia/intelligence');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] CIA intelligence error:', error);
    return NextResponse.json(
      { message: 'Falha ao carregar inteligência operacional do WhatsApp.' },
      { status: 502 },
    );
  }
}
