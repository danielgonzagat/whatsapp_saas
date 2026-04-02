import { NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function POST(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'POST', '/whatsapp-api/session/force-check');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] session/force-check error:', error);
    return NextResponse.json(
      { message: 'Falha ao forçar verificação da sessão.' },
      { status: 502 },
    );
  }
}
