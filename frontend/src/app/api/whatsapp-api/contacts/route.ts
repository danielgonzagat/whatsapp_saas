import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../proxy';

/** Get. */
export async function GET(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'GET', '/whatsapp-api/contacts');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] contacts error:', error);
    return NextResponse.json(
      { message: 'Falha ao carregar contatos do WhatsApp.' },
      { status: 502 },
    );
  }
}

/** Post. */
export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/contacts');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] create contact error:', error);
    return NextResponse.json({ message: 'Falha ao criar contato no WhatsApp.' }, { status: 502 });
  }
}
