import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../proxy';

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/sync');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] sync error:', error);
    return NextResponse.json({ message: 'Falha ao sincronizar WhatsApp.' }, { status: 502 });
  }
}
