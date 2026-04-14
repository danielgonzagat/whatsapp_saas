import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/logout');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] logout error:', error);
    return NextResponse.json(
      { message: 'Falha ao resetar a sessão do WhatsApp.' },
      { status: 502 },
    );
  }
}
