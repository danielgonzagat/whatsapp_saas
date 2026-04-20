import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../../proxy';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(
      request,
      'POST',
      '/whatsapp-api/session/backlog/start',
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] backlog start error:', error);
    return NextResponse.json(
      { message: 'Falha ao iniciar o backlog do WhatsApp.' },
      { status: 502 },
    );
  }
}
