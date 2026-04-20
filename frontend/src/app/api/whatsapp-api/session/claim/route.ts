import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/claim');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] claim error:', error);
    return NextResponse.json(
      { message: 'Falha ao reivindicar a sessão do WhatsApp.' },
      { status: 502 },
    );
  }
}
