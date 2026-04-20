import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../proxy';

/** Get. */
export async function GET(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'GET', '/whatsapp-api/provider-status');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] provider-status error:', error);
    return NextResponse.json({ message: 'Falha ao obter status do provider.' }, { status: 502 });
  }
}
