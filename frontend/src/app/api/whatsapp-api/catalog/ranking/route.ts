import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const result = await proxyWhatsAppRequest(
      request,
      'GET',
      `/whatsapp-api/catalog/ranking${qs ? `?${qs}` : ''}`,
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] catalog/ranking error:', error);
    return NextResponse.json({ message: 'Falha ao obter ranking do catálogo.' }, { status: 502 });
  }
}
