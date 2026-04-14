import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/bootstrap');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] bootstrap error:', error);
    return NextResponse.json({ message: 'Falha ao iniciar a CIA do WhatsApp.' }, { status: 502 });
  }
}
