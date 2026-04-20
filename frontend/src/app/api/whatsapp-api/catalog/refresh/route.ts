import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/catalog/refresh');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] catalog/refresh error:', error);
    return NextResponse.json({ message: 'Falha ao atualizar catálogo.' }, { status: 502 });
  }
}
