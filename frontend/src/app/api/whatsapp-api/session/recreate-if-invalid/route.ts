import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(
      request,
      'POST',
      '/whatsapp-api/session/recreate-if-invalid',
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] session/recreate-if-invalid error:', error);
    return NextResponse.json({ message: 'Falha ao recriar sessão inválida.' }, { status: 502 });
  }
}
