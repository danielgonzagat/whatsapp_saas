import { type NextRequest, NextResponse } from 'next/server';
import { proxyWhatsAppRequest } from '../../proxy';

/** Get. */
export async function GET(request: NextRequest) {
  try {
    const result = await proxyWhatsAppRequest(request, 'GET', '/whatsapp-api/session/status');
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[WhatsApp Proxy] status error:', error);
    const status =
      typeof (error as { status?: number })?.status === 'number'
        ? (error as { status: number }).status
        : 502;
    return NextResponse.json(
      {
        message:
          status === 401
            ? 'Sua sessão expirou. Faça login novamente para acompanhar o status do WhatsApp.'
            : 'Falha ao consultar status do WhatsApp.',
      },
      { status },
    );
  }
}
