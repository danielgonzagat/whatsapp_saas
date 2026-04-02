import { NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    const { phone } = await params;
    const encodedPhone = encodeURIComponent(phone);
    const result = await proxyWhatsAppRequest(
      request,
      'GET',
      `/whatsapp-api/check/${encodedPhone}`,
    );
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] check/phone error:', error);
    return NextResponse.json(
      { message: 'Falha ao verificar número de telefone.' },
      { status: 502 },
    );
  }
}
