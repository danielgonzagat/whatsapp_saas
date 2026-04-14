import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/action-turn');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] action turn error:', error);
    return NextResponse.json(
      { message: 'Falha ao executar um turno multimodal no WhatsApp.' },
      { status: 502 },
    );
  }
}
