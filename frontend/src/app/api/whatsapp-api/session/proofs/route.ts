import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.search || '';
    const result = await proxyWhatsAppRequest(
      request,
      'GET',
      `/whatsapp-api/session/proofs${query}`,
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] proofs error:', error);
    return NextResponse.json(
      { message: 'Falha ao carregar as provas operacionais do WhatsApp.' },
      { status: 502 },
    );
  }
}
