import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

export async function GET(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'GET', '/whatsapp-api/session/qr');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] qr error:', error);
    const status =
      typeof (error as { status?: number })?.status === 'number'
        ? (error as { status: number }).status
        : 502;
    return NextResponse.json(
      {
        message:
          status === 401
            ? 'Sua sessão expirou. Faça login novamente para continuar com o QR Code.'
            : 'Falha ao obter QR Code do WhatsApp.',
      },
      { status },
    );
  }
}
